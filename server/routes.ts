import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { getStripe, isStripeConfigured } from "./stripe";
import { getGeocodingClient, getDirectionsClient, isMapboxConfigured } from "./mapbox";
import { passport } from "./auth";
import { db } from "./db";
import { eq, and, gte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  insertServiceSchema, insertBookingSchema, insertQuoteSchema, insertUserSchema,
  insertCompanySchema, insertDriverSchema, insertVehicleSchema, insertOfferSchema,
  insertMessageSchema, insertAttachmentSchema, insertReviewSchema,
  insertTrackingUpdateSchema, insertNotificationSchema, insertMarketplaceListingSchema,
  insertSharedRideSchema, insertStaffSharingSchema,
  insertResourceSharingSchema, insertAnnouncementSchema, insertCouponSchema,
  insertDriverAvailabilitySchema, insertDriverTimeOffSchema, insertCargoItemSchema,
  insertVerificationDocumentSchema, insertApiKeySchema,
  offers, marketplaceListings, sharedRides, rideBookings, companies, bookings, drivers, vehicles,
  users, messages
} from "@shared/schema";
import type { User, Booking } from "@shared/schema";
import { getCalendarSyncProvider, type CalendarProvider } from "./services/calendarSync";
import { getCargoRecognitionProvider } from "./services/cargoRecognition";
import { getTranslationProvider } from "./services/translation";
import { checkGpsAnomaly, checkDuplicateAccount } from "./services/fraud";
import { dispatchWebhookEvent } from "./services/webhooks";
import { generateApiKey, hashApiKey } from "./lib/crypto";
import { userCanAccessBooking as userCanAccessBookingImpl } from "./lib/authz";
import { validateDataUrl } from "./lib/dataUrl";
import { getBroadcaster } from "./socket";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { requireAuth, requireAdmin } from "./lib/authMiddleware";
import { handleRoadServiceOrderPayment } from "./roadServices/router";

const userCanAccessBooking = (user: User, booking: Booking) =>
  userCanAccessBookingImpl(user, booking, (id) => storage.getDriver(id));

// Base64 data-URL upload limits, shared by cargo photos, chat attachments, and
// verification documents.
const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
const DOCUMENT_MIME_TYPES = [...IMAGE_MIME_TYPES, "application/pdf"] as const;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB per file

// Verification documents (ID cards, selfies, licenses, insurance certs) are sensitive PII;
// only the document's own holder (or the company a driver/company doc belongs to) or an
// admin may create or read them.
async function userCanAccessVerificationHolder(
  user: User,
  holderType: string,
  holderId: string,
): Promise<boolean> {
  if (user.role === "admin") return true;
  if (holderType === "user") return user.id === holderId;
  if (holderType === "driver") {
    const driver = await storage.getDriver(holderId);
    return driver?.userId === user.id || (!!driver && user.companyId === driver.companyId);
  }
  if (holderType === "company") return user.companyId === holderId;
  return false;
}

// Credential-stuffing / brute-force guard: tighter than the general /api limiter,
// keyed by IP + email/phone so a single attacker can't burn through many accounts
// under one IP allowance, and legitimate users on a shared IP aren't blocked.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip || "unknown")}:${req.body?.email || req.body?.phone || ""}`,
  message: { message: "Too many login attempts. Please try again later." },
});

// AI endpoints (cargo recognition, translation) call the paid Anthropic API per request;
// keep this tighter than and independent of the general API limiter, keyed per user so one
// account can't exhaust the shared IP allowance and starve everyone else on the same NAT/office.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user as User | undefined)?.id || ipKeyGenerator(req.ip || "unknown"),
  message: { message: "Too many AI requests. Please try again in a minute." },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // === AUTHENTICATION ROUTES ===
  app.post("/api/auth/register", authLimiter, async (req, res) => {
    try {
      const { email, phone, password, name, referralCode } = req.body;

      if (!email || !phone || !password || !name) {
        return res.status(400).json({ message: "All fields are required" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const existingPhone = await storage.getUserByPhone(phone);
      if (existingPhone) {
        return res.status(400).json({ message: "Phone already registered" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        email,
        phone,
        password: hashedPassword,
        name,
        referralCode: nanoid(8).toUpperCase(),
        referredByCode: referralCode || undefined,
      });

      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Login after registration failed" });
        }
        const { password: _, ...userWithoutPassword } = user;
        res.status(201).json(userWithoutPassword);
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/auth/login", authLimiter, (req, res, next) => {
    passport.authenticate("local", (err: any, user: User | false, info: any) => {
      if (err) {
        return res.status(500).json({ message: "Authentication error" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Login failed" });
        }
        const { password: _, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.json(null);
    }
    const user = req.user as User;
    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  // === USER ROUTES ===
  app.get("/api/users", requireAdmin, async (_req, res) => {
    const allUsers = await storage.getAllUsers();
    res.json(allUsers.map(({ password: _, ...rest }) => rest));
  });

  // Lets a company look up an existing, not-yet-linked user by phone number before
  // inviting them as a driver (POST /api/drivers requires an existing userId). Scoped to
  // authenticated company users and returns only the minimal fields needed to confirm
  // identity - never exposed as a general, unauthenticated phone-to-user lookup. Must be
  // registered before /api/users/:id below, or that route's :id param would swallow this
  // path first since Express matches by registration order, not specificity.
  app.get("/api/users/lookup-for-driver-invite", requireAuth, async (req, res) => {
    const user = req.user as User;
    if (!user.companyId && user.role !== "admin") {
      return res.status(403).json({ message: "Only company accounts can look up drivers to invite" });
    }
    const phone = String(req.query.phone || "");
    if (!phone) {
      return res.status(400).json({ message: "phone is required" });
    }
    const found = await storage.getUserByPhone(phone);
    if (!found) {
      return res.status(404).json({ message: "No account found with that phone number" });
    }
    if (found.companyId) {
      return res.status(409).json({ message: "This user is already linked to a company" });
    }
    res.json({ id: found.id, name: found.name, phone: found.phone });
  });

  app.get("/api/users/:id", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  // Guest checkout: creates a brand-new account and logs it in immediately. Never accepts
  // a caller-supplied password — this endpoint is unauthenticated, so honoring a
  // client-provided password here would make it an unthrottled alternative to the rate
  // limited /api/auth/login and, worse, would mean every guest account shared whatever
  // fixed placeholder password a client happened to send. Instead each guest account gets
  // its own cryptographically random password that is never returned to the client; if the
  // phone number is already registered we simply refuse and point the caller at the real
  // login flow instead of attempting any password comparison here.
  app.post("/api/users", async (req, res) => {
    try {
      const { password: _ignored, ...rest } = req.body;
      const userData = insertUserSchema.parse({ ...rest, password: nanoid(32) });

      const existing = await storage.getUserByPhone(userData.phone);
      if (existing) {
        return res.status(409).json({ message: "An account with this phone number already exists. Please log in." });
      }

      userData.password = await bcrypt.hash(userData.password, 10);
      const user = await storage.createUser(userData);

      // Sanitize user object before login (remove password hash)
      const { password: _, ...sanitizedUser } = user;

      // Automatically log in newly created user
      await new Promise<void>((resolve, reject) => {
        req.login(sanitizedUser as any, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      res.status(201).json(sanitizedUser);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // === COMPANY ROUTES ===
  app.get("/api/companies", async (req, res) => {
    const companies = await storage.getAllCompanies();
    res.json(companies);
  });

  app.get("/api/companies/:id", async (req, res) => {
    const company = await storage.getCompany(req.params.id);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }
    res.json(company);
  });

  // Registering a company both creates the company row and links the requesting user to
  // it as its owner - previously this endpoint created an orphaned company with no way for
  // any user to ever become associated with it, since nothing else in the app can set
  // users.companyId/role.
  app.post("/api/companies", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      if (user.companyId) {
        return res.status(409).json({ message: "You already belong to a company" });
      }
      const companyData = insertCompanySchema.parse(req.body);
      const company = await storage.createCompany(companyData);
      const linkedUser = await storage.linkUserToCompany(user.id, company.id, "company");
      if (!linkedUser) {
        return res.status(409).json({ message: "You already belong to a company" });
      }
      res.status(201).json(company);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/companies/:id/verify", requireAdmin, async (req, res) => {
    const { verified } = req.body;
    const company = await storage.verifyCompany(req.params.id, verified);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }
    res.json(company);
  });

  // === DRIVER ROUTES ===
  app.get("/api/drivers", async (req, res) => {
    const drivers = await storage.getAllDrivers();
    res.json(drivers);
  });

  app.get("/api/drivers/:id", async (req, res) => {
    const driver = await storage.getDriver(req.params.id);
    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }
    res.json(driver);
  });

  app.get("/api/companies/:companyId/drivers", async (req, res) => {
    const drivers = await storage.getCompanyDrivers(req.params.companyId);
    res.json(drivers);
  });

  app.post("/api/drivers", requireAuth, async (req, res) => {
    try {
      const driverData = insertDriverSchema.parse(req.body);
      const user = req.user as User;
      if (user.companyId !== driverData.companyId && user.role !== "admin") {
        return res.status(403).json({ message: "Not authorized to add a driver for this company" });
      }
      const targetUser = await storage.getUser(driverData.userId);
      if (!targetUser) {
        return res.status(404).json({ message: "No user account found for this driver" });
      }
      if (targetUser.companyId && targetUser.companyId !== driverData.companyId) {
        return res.status(409).json({ message: "This user already belongs to a different company" });
      }
      const driver = await storage.createDriver(driverData);
      // Link the driver's own account too, not just the drivers row - otherwise the
      // driver could never see driver-scoped views or pass company-ownership checks
      // that key off users.companyId (e.g. assigning themselves to a booking).
      await storage.linkUserToCompany(driverData.userId, driverData.companyId, "driver");
      res.status(201).json(driver);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/drivers/:id/availability", requireAuth, async (req, res) => {
    const { available } = req.body;
    if (typeof available !== 'boolean') {
      return res.status(400).json({ message: "Available must be a boolean" });
    }
    const existingDriver = await storage.getDriver(req.params.id);
    if (!existingDriver) {
      return res.status(404).json({ message: "Driver not found" });
    }
    const user = req.user as User;
    if (
      user.id !== existingDriver.userId &&
      user.companyId !== existingDriver.companyId &&
      user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Not authorized to update this driver" });
    }
    const driver = await storage.updateDriverAvailability(req.params.id, available);
    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }
    res.json(driver);
  });

  // === VEHICLE ROUTES ===
  app.get("/api/companies/:companyId/vehicles", async (req, res) => {
    const vehicles = await storage.getCompanyVehicles(req.params.companyId);
    res.json(vehicles);
  });

  // === SERVICE ROUTES ===
  app.get("/api/services", async (req, res) => {
    const services = await storage.getAllServices();
    res.json(services);
  });

  app.get("/api/services/:id", async (req, res) => {
    const service = await storage.getService(req.params.id);
    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }
    res.json(service);
  });

  app.post("/api/services", async (req, res) => {
    try {
      const serviceData = insertServiceSchema.parse(req.body);
      const service = await storage.createService(serviceData);
      res.status(201).json(service);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // === QUOTE ROUTES ===
  app.post("/api/quotes", async (req, res) => {
    try {
      const quoteData = insertQuoteSchema.parse(req.body);
      const quote = await storage.createQuote(quoteData);
      res.status(201).json(quote);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/quotes/:id", async (req, res) => {
    const quote = await storage.getQuote(req.params.id);
    if (!quote) {
      return res.status(404).json({ message: "Quote not found" });
    }
    res.json(quote);
  });

  // === BOOKING ROUTES ===
  app.get("/api/bookings", requireAuth, async (req, res) => {
    const user = req.user as User;
    if (user.role === "admin") {
      return res.json(await storage.getAllBookings());
    }
    if (user.companyId) {
      return res.json(await storage.getCompanyBookings(user.companyId));
    }
    res.json(await storage.getUserBookings(user.id));
  });

  app.get("/api/bookings/public", async (req, res) => {
    const bookings = await storage.getPublicBookings();
    res.json(bookings);
  });

  app.get("/api/bookings/:id", requireAuth, async (req, res) => {
    const booking = await storage.getBooking(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    const user = req.user as User;
    if (!(await userCanAccessBooking(user, booking))) {
      return res.status(403).json({ message: "Not authorized to view this booking" });
    }
    res.json(booking);
  });

  app.get("/api/users/:userId/bookings", requireAuth, async (req, res) => {
    const user = req.user as User;
    if (user.id !== req.params.userId && user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }
    const bookings = await storage.getUserBookings(req.params.userId);
    res.json(bookings);
  });

  app.get("/api/companies/:companyId/bookings", requireAuth, async (req, res) => {
    const user = req.user as User;
    if (user.companyId !== req.params.companyId && user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }
    const bookings = await storage.getCompanyBookings(req.params.companyId);
    res.json(bookings);
  });

  app.post("/api/bookings", requireAuth, async (req, res) => {
    try {
      const bookingData = insertBookingSchema.parse(req.body);
      const user = req.user as User;

      let finalPrice = bookingData.totalPrice;
      let discountAmount: string | undefined;
      let couponRedemptionId: string | undefined;

      if (bookingData.couponCode) {
        const coupon = await storage.getCouponByCode(bookingData.couponCode);
        const now = new Date();
        const amount = Number(bookingData.totalPrice);

        if (!coupon || !coupon.active) {
          return res.status(400).json({ message: "Invalid coupon code" });
        }
        if (coupon.validUntil && new Date(coupon.validUntil) < now) {
          return res.status(400).json({ message: "This coupon has expired" });
        }
        if (coupon.maxRedemptions !== null && (coupon.timesRedeemed ?? 0) >= coupon.maxRedemptions) {
          return res.status(400).json({ message: "This coupon has reached its redemption limit" });
        }
        if (amount < Number(coupon.minBookingAmount ?? 0)) {
          return res.status(400).json({ message: `Coupon requires a minimum booking amount of ${coupon.minBookingAmount}` });
        }

        const discount = coupon.discountType === "percent"
          ? (amount * Number(coupon.discountValue)) / 100
          : Number(coupon.discountValue);
        discountAmount = Math.min(discount, amount).toFixed(2);
        finalPrice = (amount - Number(discountAmount)).toFixed(2);

        // Atomically claim a redemption slot before creating the booking (redeemCoupon's
        // conditional update enforces maxRedemptions) so concurrent bookings can never push
        // a coupon past its limit; the booking is only created once the slot is secured.
        const redemption = await storage.redeemCoupon(coupon.id, user.id, undefined, discountAmount);
        if (!redemption) {
          return res.status(400).json({ message: "This coupon has reached its redemption limit" });
        }
        couponRedemptionId = redemption.id;
      }

      const booking = await storage.createBooking({
        ...bookingData,
        totalPrice: finalPrice,
        discountAmount,
      });

      if (couponRedemptionId) {
        await storage.linkCouponRedemptionToBooking(couponRedemptionId, booking.id);
      }

      res.status(201).json(booking);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/bookings/:id/status", requireAuth, async (req, res) => {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    const existing = await storage.getBooking(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Only the assigned company/driver or an admin may drive status transitions
    // (the customer who placed the booking can view it, but not advance its status).
    const user = req.user as User;
    const isAssignedDriver = existing.driverId
      ? (await storage.getDriver(existing.driverId))?.userId === user.id
      : false;
    if (user.role !== "admin" && user.companyId !== existing.companyId && !isAssignedDriver) {
      return res.status(403).json({ message: "Not authorized to update this booking" });
    }

    const booking = await storage.updateBookingStatus(req.params.id, status);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (status === "delivered") {
      // Capture the escrowed payment now that the delivery is confirmed. A capture
      // failure must not be silently swallowed - it means the platform delivered a
      // service without collecting payment, so we record it as "failed" (distinct from
      // "authorized"/"captured") so ops can see and retry it instead of it looking paid.
      if (booking.paymentIntentId && booking.paymentStatus === "authorized") {
        if (!isStripeConfigured()) {
          console.error(`Cannot capture payment for booking ${booking.id}: Stripe is not configured`);
          await storage.updateBookingPayment(booking.id, booking.paymentIntentId, "failed");
        } else {
          try {
            await getStripe().paymentIntents.capture(booking.paymentIntentId);
            await storage.updateBookingPayment(booking.id, booking.paymentIntentId, "captured");
          } catch (error: any) {
            console.error(`Failed to capture escrowed payment for booking ${booking.id}:`, error.message);
            await storage.updateBookingPayment(booking.id, booking.paymentIntentId, "failed");
          }
        }
      }

      if (booking.companyId) {
        await storage.checkAndAwardMilestoneBadges("company", booking.companyId);
      }
      if (booking.driverId) {
        await storage.checkAndAwardMilestoneBadges("driver", booking.driverId);
      }

      // Credit the referrer on the customer's first delivered booking
      const bookingCustomer = await storage.getUser(booking.userId);
      if (bookingCustomer?.referredByCode) {
        const alreadyCredited = await storage.hasReferralRewardForReferredUser(bookingCustomer.id);
        if (!alreadyCredited) {
          const referrerResult = await db.select().from(users).where(eq(users.referralCode, bookingCustomer.referredByCode));
          const referrer = referrerResult[0];
          if (referrer) {
            try {
              await storage.createReferralReward({
                referrerUserId: referrer.id,
                referredUserId: bookingCustomer.id,
                bookingId: booking.id,
                amount: "25",
              });
            } catch (error: any) {
              // Unique constraint on referredUserId: a concurrent request already
              // credited this referral first — not an error, just a lost race.
              if (error.code !== "23505") throw error;
            }
          }
        }
      }
    }

    if (booking.companyId) {
      dispatchWebhookEvent(booking.companyId, "booking.status_changed", {
        bookingId: booking.id,
        status: booking.status,
      }).catch(() => undefined);
    }

    res.json(booking);
  });

  app.post("/api/bookings/:id/transfer", requireAuth, async (req, res) => {
    try {
      const { toCompanyId, reason } = req.body;
      if (!toCompanyId) {
        return res.status(400).json({ message: "toCompanyId is required" });
      }

      const booking = await storage.getBooking(req.params.id);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      if (!booking.companyId) {
        return res.status(400).json({ message: "Booking has no assigned company to transfer from" });
      }

      const user = req.user as User;
      if (user.companyId !== booking.companyId && user.role !== "admin") {
        return res.status(403).json({ message: "Not authorized to transfer this booking" });
      }

      const transfer = await storage.transferBooking({
        bookingId: booking.id,
        fromCompanyId: booking.companyId,
        toCompanyId,
        transferredBy: user.id,
        reason,
      });
      res.status(201).json(transfer);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/bookings/:id/transfers", requireAuth, async (req, res) => {
    const transfers = await storage.getBookingTransfers(req.params.id);
    res.json(transfers);
  });

  // Admin override to (re)assign a booking's driver directly, independent of the normal
  // offer-acceptance flow.
  app.patch("/api/bookings/:id/driver", requireAdmin, async (req, res) => {
    const { driverId } = req.body;
    if (!driverId) {
      return res.status(400).json({ message: "driverId is required" });
    }
    const driver = await storage.getDriver(driverId);
    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }
    const booking = await storage.updateBookingDriver(req.params.id, driverId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    res.json(booking);
  });

  app.patch("/api/bookings/:id/assign", requireAuth, async (req, res) => {
    try {
      const { companyId, driverId, vehicleId } = req.body;
      if (!companyId || !driverId || !vehicleId) {
        return res.status(400).json({ message: "Company ID, Driver ID, and Vehicle ID are required" });
      }

      const user = req.user as User;
      if (user.companyId !== companyId && user.role !== "admin") {
        return res.status(403).json({ message: "Not authorized to assign this company to a booking" });
      }

      const existing = await storage.getBooking(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const booking = await storage.assignCompanyToBooking(req.params.id, companyId, driverId, vehicleId);
      if (!booking) {
        return res.status(409).json({ message: "This booking has already been assigned to a company" });
      }
      res.json(booking);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Payment status is normally driven exclusively by the Stripe webhook
  // (/api/stripe-webhook); this manual override exists only for admin reconciliation.
  app.patch("/api/bookings/:id/payment", requireAdmin, async (req, res) => {
    const { paymentIntentId, paymentStatus } = req.body;
    if (!paymentIntentId || !paymentStatus) {
      return res.status(400).json({ message: "Payment Intent ID and status are required" });
    }

    const booking = await storage.updateBookingPayment(req.params.id, paymentIntentId, paymentStatus);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    res.json(booking);
  });

  app.patch("/api/bookings/:id/cancel", requireAuth, async (req, res) => {
    const booking = await storage.getBooking(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    
    if (["delivered", "cancelled"].includes(booking.status)) {
      return res.status(400).json({ message: "Cannot cancel completed or already cancelled booking" });
    }
    
    const user = req.user as User;
    if (booking.userId !== user.id) {
      return res.status(403).json({ message: "Not authorized to cancel this booking" });
    }
    
    const cancelled = await storage.cancelBooking(req.params.id);
    res.json(cancelled);
  });

  // === OFFER ROUTES ===
  app.get("/api/bookings/:bookingId/offers", requireAuth, async (req, res) => {
    const booking = await storage.getBooking(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    const user = req.user as User;
    const bookingOffers = await storage.getBookingOffers(req.params.bookingId);
    // The customer deciding on bids (or an admin) sees every offer; a bidding company
    // only sees its own offer(s), keeping competitors' bid prices private.
    if (user.role === "admin" || user.id === booking.userId) {
      return res.json(bookingOffers);
    }
    if (user.companyId) {
      return res.json(bookingOffers.filter((o) => o.companyId === user.companyId));
    }
    res.status(403).json({ message: "Not authorized to view these offers" });
  });

  app.post("/api/offers", requireAuth, async (req, res) => {
    try {
      const offerData = insertOfferSchema.parse(req.body);
      const user = req.user as User;
      // Without this check any authenticated user could submit a bid claiming to be from
      // any company by simply passing a different companyId in the body.
      if (user.companyId !== offerData.companyId && user.role !== "admin") {
        return res.status(403).json({ message: "Not authorized to submit an offer for this company" });
      }
      const booking = await storage.getBooking(offerData.bookingId);
      if (!booking || !booking.isPublic || booking.status !== "posted") {
        return res.status(400).json({ message: "This booking is not open for offers" });
      }
      const offer = await storage.createOffer(offerData);
      res.status(201).json(offer);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/offers/:id/accept", requireAuth, async (req, res) => {
    try {
      const offerResult = await db.select().from(offers).where(eq(offers.id, req.params.id));
      const offer = offerResult[0];
      
      if (!offer) {
        return res.status(404).json({ message: "Offer not found" });
      }
      
      if (offer.status !== "pending") {
        return res.status(400).json({ message: "Only pending offers can be accepted" });
      }
      
      const booking = await storage.getBooking(offer.bookingId);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      
      const user = req.user as User;
      if (booking.userId !== user.id) {
        return res.status(403).json({ message: "Not authorized to accept this offer" });
      }

      if (offer.companyId) {
        const company = await storage.getCompany(offer.companyId);
        if (company) {
          const limit = company.monthlyBookingLimit ?? 0;
          if (limit > 0) {
            const used = await storage.getCompanyMonthlyBookingCount(company.id);
            if (used >= limit) {
              return res.status(402).json({
                message: "This company has reached its monthly booking limit for its current plan. Please upgrade the plan to accept more jobs.",
              });
            }
          }
        }
      }

      const accepted = await storage.acceptOffer(req.params.id);
      res.json(accepted);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/offers/:id/reject", requireAuth, async (req, res) => {
    try {
      const offerResult = await db.select().from(offers).where(eq(offers.id, req.params.id));
      const offer = offerResult[0];
      
      if (!offer) {
        return res.status(404).json({ message: "Offer not found" });
      }
      
      if (offer.status !== "pending") {
        return res.status(400).json({ message: "Only pending offers can be rejected" });
      }
      
      const booking = await storage.getBooking(offer.bookingId);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      
      const user = req.user as User;
      if (booking.userId !== user.id) {
        return res.status(403).json({ message: "Not authorized to reject this offer" });
      }
      
      const rejected = await storage.rejectOffer(req.params.id);
      res.json(rejected);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // === MESSAGE ROUTES ===
  app.get("/api/bookings/:bookingId/messages", requireAuth, async (req, res) => {
    const booking = await storage.getBooking(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (!(await userCanAccessBooking(req.user as User, booking))) {
      return res.status(403).json({ message: "Not authorized to view these messages" });
    }
    const messages = await storage.getBookingMessages(req.params.bookingId);
    res.json(messages);
  });

  app.post("/api/messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const messageData = insertMessageSchema.parse({ ...req.body, senderId: user.id });
      const booking = await storage.getBooking(messageData.bookingId);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      if (!(await userCanAccessBooking(user, booking))) {
        return res.status(403).json({ message: "Not authorized to message on this booking" });
      }
      const message = await storage.createMessage(messageData);
      // Push to the booking's WebSocket subscribers (e.g. the other chat participant) so
      // BookingChat.tsx's live-update listener actually has something to react to.
      getBroadcaster()?.broadcastToBooking(messageData.bookingId, {
        type: "message",
        bookingId: messageData.bookingId,
      });
      res.status(201).json(message);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // === SUPPORT CHAT ROUTES ===
  app.get("/api/support/:bookingId/messages", async (req, res) => {
    try {
      const messages = await storage.getSupportMessages(req.params.bookingId);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/support/messages", async (req, res) => {
    try {
      const { bookingId, message, sender } = req.body;
      if (!bookingId || !message || !sender) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      const user = req.user as User | undefined;
      const supportMessage = await storage.createSupportMessage({
        bookingId,
        message,
        sender,
        userId: user?.id,
      });
      
      res.status(201).json(supportMessage);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // === ATTACHMENT ROUTES ===
  app.get("/api/bookings/:bookingId/attachments", requireAuth, async (req, res) => {
    const booking = await storage.getBooking(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (!(await userCanAccessBooking(req.user as User, booking))) {
      return res.status(403).json({ message: "Not authorized to view these attachments" });
    }
    const attachments = await storage.getBookingAttachments(req.params.bookingId);
    res.json(attachments);
  });

  app.post("/api/attachments", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const attachmentData = insertAttachmentSchema.parse({ ...req.body, uploaderId: user.id });
      if (attachmentData.fileUrl.startsWith("data:")) {
        validateDataUrl(attachmentData.fileUrl, { allowedMimeTypes: DOCUMENT_MIME_TYPES, maxBytes: MAX_UPLOAD_BYTES });
      }
      const booking = await storage.getBooking(attachmentData.bookingId);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      if (!(await userCanAccessBooking(user, booking))) {
        return res.status(403).json({ message: "Not authorized to upload to this booking" });
      }
      const attachment = await storage.createAttachment(attachmentData);
      res.status(201).json(attachment);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // === REVIEW ROUTES ===
  app.get("/api/companies/:companyId/reviews", async (req, res) => {
    const reviews = await storage.getCompanyReviews(req.params.companyId);
    res.json(reviews);
  });

  app.post("/api/reviews", requireAuth, async (req, res) => {
    try {
      const reviewData = insertReviewSchema.parse(req.body);
      const review = await storage.createReview(reviewData);
      res.status(201).json(review);
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(409).json({ message: "You have already reviewed this booking" });
      }
      res.status(400).json({ message: error.message });
    }
  });

  // === MARKETPLACE ROUTES ===
  app.get("/api/marketplace", async (req, res) => {
    try {
      const listings = await db.select().from(marketplaceListings)
        .where(eq(marketplaceListings.available, true))
        .orderBy(marketplaceListings.createdAt);
      res.json(listings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/marketplace", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const listingData = insertMarketplaceListingSchema.parse(req.body);
      const result = await db.insert(marketplaceListings).values({
        ...listingData,
        userId: user.id,
        companyId: user.companyId || null,
      }).returning();
      res.status(201).json(result[0]);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/marketplace/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const listing = await db.select().from(marketplaceListings)
        .where(eq(marketplaceListings.id, req.params.id))
        .limit(1);
      
      if (!listing[0]) {
        return res.status(404).json({ message: "Listing not found" });
      }
      
      if (listing[0].userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      await db.delete(marketplaceListings).where(eq(marketplaceListings.id, req.params.id));
      res.json({ message: "Listing deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // === ANALYTICS ROUTES ===
  app.get("/api/analytics", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      if (!user.companyId) {
        return res.status(403).json({ message: "Company access required" });
      }

      const bookingsData = await db.select().from(bookings)
        .where(eq(bookings.companyId, user.companyId));
      
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const revenueByMonth = new Map<string, number>();
      const bookingsByMonth = new Map<string, number>();
      
      bookingsData.forEach(b => {
        const date = new Date(b.createdAt);
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        const revenue = parseFloat(b.totalPrice.toString());
        
        revenueByMonth.set(monthKey, (revenueByMonth.get(monthKey) || 0) + revenue);
        bookingsByMonth.set(monthKey, (bookingsByMonth.get(monthKey) || 0) + 1);
      });

      const now = new Date();
      const last6Months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        last6Months.push({
          key: `${d.getFullYear()}-${d.getMonth()}`,
          label: monthNames[d.getMonth()]
        });
      }
      
      const revenue = last6Months.map(m => ({
        month: m.label,
        amount: Math.round(revenueByMonth.get(m.key) || 0)
      }));
      
      const bookingsChart = last6Months.map(m => ({
        month: m.label,
        count: bookingsByMonth.get(m.key) || 0
      }));

      const totalRevenue = bookingsData.reduce((sum, b) => sum + parseFloat(b.totalPrice.toString()), 0);
      const totalBookings = bookingsData.length;

      const analytics = {
        revenue,
        bookings: bookingsChart,
        ratings: [
          { category: "Excellent (5★)", avg: 45 },
          { category: "Good (4★)", avg: 35 },
          { category: "Average (3★)", avg: 15 },
          { category: "Poor (2★)", avg: 3 },
          { category: "Bad (1★)", avg: 2 },
        ],
        topServices: [
          { name: "Home Moving", count: Math.round(totalBookings * 0.47) },
          { name: "Office Relocation", count: Math.round(totalBookings * 0.34) },
          { name: "Furniture Delivery", count: Math.round(totalBookings * 0.29) },
          { name: "Small Items", count: Math.round(totalBookings * 0.22) },
          { name: "Heavy Equipment", count: Math.round(totalBookings * 0.17) },
        ],
        stats: {
          totalRevenue: Math.round(totalRevenue),
          totalBookings,
          avgRating: 4.6,
          activeDrivers: await db.select().from(drivers)
            .where(eq(drivers.companyId, user.companyId))
            .then(d => d.length),
        },
      };
      
      res.json(analytics);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/eco/companies", async (req, res) => {
    try {
      const companiesList = await db.select().from(companies);
      const ecoCompanies = companiesList.map((c: any) => ({
        id: c.id,
        name: c.name,
        totalTrips: Math.floor(Math.random() * 2000) + 500,
        totalCO2kg: Math.floor(Math.random() * 30000) + 5000,
        avgCO2PerTrip: (Math.random() * 15) + 5,
        electricVehiclePercent: Math.floor(Math.random() * 80) + 10,
        ecoRating: parseFloat((Math.random() * 4 + 6).toFixed(1)),
      }));
      res.json(ecoCompanies.slice(0, 5));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // === VEHICLE ROUTES ===
  app.get("/api/vehicles", async (req, res) => {
    try {
      const { companyId } = req.query;
      let query = db.select().from(vehicles);
      
      if (companyId) {
        query = query.where(eq(vehicles.companyId, companyId as string)) as any;
      }
      
      const vehiclesList = await query;
      res.json(vehiclesList);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/vehicles", requireAuth, async (req, res) => {
    try {
      const vehicleData = insertVehicleSchema.parse(req.body);
      const user = req.user as User;
      if (user.companyId !== vehicleData.companyId && user.role !== "admin") {
        return res.status(403).json({ message: "Not authorized to add a vehicle for this company" });
      }
      const result = await db.insert(vehicles).values(vehicleData).returning();
      res.status(201).json(result[0]);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/vehicles/:id", requireAuth, async (req, res) => {
    try {
      const existing = (await db.select().from(vehicles).where(eq(vehicles.id, req.params.id)))[0];
      if (!existing) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      const user = req.user as User;
      if (user.companyId !== existing.companyId && user.role !== "admin") {
        return res.status(403).json({ message: "Not authorized to update this vehicle" });
      }
      const patch = insertVehicleSchema.partial().omit({ companyId: true }).parse(req.body);
      const result = await db.update(vehicles).set(patch).where(eq(vehicles.id, req.params.id)).returning();
      res.json(result[0]);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/vehicles/:id", requireAuth, async (req, res) => {
    const existing = (await db.select().from(vehicles).where(eq(vehicles.id, req.params.id)))[0];
    if (!existing) {
      return res.status(404).json({ message: "Vehicle not found" });
    }
    const user = req.user as User;
    if (user.companyId !== existing.companyId && user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to delete this vehicle" });
    }
    await db.delete(vehicles).where(eq(vehicles.id, req.params.id));
    res.status(204).send();
  });

  // === CARPOOLING ROUTES ===
  app.get("/api/carpool", async (req, res) => {
    try {
      const rides = await db.select().from(sharedRides)
        .where(eq(sharedRides.status, "active"))
        .orderBy(sharedRides.departureTime);
      res.json(rides);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/carpool", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const rideData = insertSharedRideSchema.parse(req.body);
      const result = await db.insert(sharedRides).values({
        ...rideData,
        driverId: user.id,
      }).returning();
      res.status(201).json(result[0]);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/carpool/:id/book", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const seatsBooked = Number(req.body?.seatsBooked);
      if (!Number.isInteger(seatsBooked) || seatsBooked < 1) {
        return res.status(400).json({ message: "seatsBooked must be a positive integer" });
      }

      const result = await db.transaction(async (tx) => {
        const ride = await tx.select().from(sharedRides)
          .where(eq(sharedRides.id, req.params.id))
          .limit(1);

        if (!ride[0]) {
          return { error: { status: 404, message: "Ride not found" } };
        }

        // Compute the price server-side from the ride's own rate; never trust a
        // client-supplied totalPrice.
        const totalPrice = (Number(ride[0].pricePerSeat) * seatsBooked).toFixed(2);

        // Conditional update guards against a seat-count race between concurrent bookings:
        // the WHERE clause only succeeds if enough seats were still available at write time.
        const updated = await tx.update(sharedRides)
          .set({ availableSeats: sql`${sharedRides.availableSeats} - ${seatsBooked}` })
          .where(and(eq(sharedRides.id, req.params.id), gte(sharedRides.availableSeats, seatsBooked)))
          .returning();

        if (updated.length === 0) {
          return { error: { status: 400, message: "Not enough seats available" } };
        }

        const booking = await tx.insert(rideBookings).values({
          rideId: req.params.id,
          passengerId: user.id,
          seatsBooked,
          totalPrice,
        }).returning();

        return { booking: booking[0] };
      });

      if (result.error) {
        return res.status(result.error.status).json({ message: result.error.message });
      }
      res.status(201).json(result.booking);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // === TRACKING ROUTES ===
  app.get("/api/bookings/:bookingId/tracking", requireAuth, async (req, res) => {
    const booking = await storage.getBooking(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (!(await userCanAccessBooking(req.user as User, booking))) {
      return res.status(403).json({ message: "Not authorized to view this booking's tracking" });
    }
    const tracking = await storage.getBookingTracking(req.params.bookingId);
    res.json(tracking);
  });

  app.post("/api/tracking", requireAuth, async (req, res) => {
    try {
      const trackingData = insertTrackingUpdateSchema.parse(req.body);
      const booking = await storage.getBooking(trackingData.bookingId);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      // Only the assigned company/driver (or an admin) can report GPS updates for a booking;
      // the customer can view tracking but must not be able to post fabricated locations.
      const user = req.user as User;
      const isAssignedDriver = booking.driverId
        ? (await storage.getDriver(booking.driverId))?.userId === user.id
        : false;
      if (user.role !== "admin" && user.companyId !== booking.companyId && !isAssignedDriver) {
        return res.status(403).json({ message: "Not authorized to report tracking for this booking" });
      }
      const tracking = await storage.createTrackingUpdate(trackingData);
      res.status(201).json(tracking);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // === NOTIFICATION ROUTES ===
  app.get("/api/users/:userId/notifications", requireAuth, async (req, res) => {
    const user = req.user as User;
    if (user.id !== req.params.userId && user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }
    const notifications = await storage.getUserNotifications(req.params.userId);
    res.json(notifications);
  });

  // Not used by the client app: notifications are created server-side (offer received,
  // status changed, etc.) via storage.createNotification() directly. Admin-only to prevent
  // an authenticated user from spoofing arbitrary notifications to other users.
  app.post("/api/notifications", requireAdmin, async (req, res) => {
    try {
      const notificationData = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification(notificationData);
      res.status(201).json(notification);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    const user = req.user as User;
    const notification = await storage.markNotificationRead(req.params.id, user.id);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    res.json(notification);
  });

  // === STAFF SHARING ROUTES ===
  app.get("/api/staff-sharing", requireAuth, async (req, res) => {
    const staffSharing = await storage.getAllStaffSharing();
    res.json(staffSharing);
  });

  app.get("/api/companies/:companyId/staff-sharing", requireAuth, async (req, res) => {
    const staffSharing = await storage.getCompanyStaffSharing(req.params.companyId);
    res.json(staffSharing);
  });

  app.post("/api/staff-sharing", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      if (!user.companyId) {
        return res.status(403).json({ message: "Company access required" });
      }

      const { lenderCompanyId: _lenderCompanyId, borrowerCompanyId: _borrowerCompanyId, ...rest } = req.body;
      const staffSharingData = insertStaffSharingSchema.parse({
        ...rest,
        lenderCompanyId: user.companyId,
      });
      const staffSharing = await storage.createStaffSharing(staffSharingData);
      res.status(201).json(staffSharing);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/staff-sharing/:id/status", requireAuth, async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }
      const user = req.user as User;
      const existing = await storage.getStaffSharing(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Staff sharing not found" });
      }
      // Any company can request an "available" listing; only the lender or the
      // already-matched borrower (or an admin) may change its status afterwards.
      const isRequesting = status === "requested" && existing.status === "available";
      const isParty = user.companyId === existing.lenderCompanyId || user.companyId === existing.borrowerCompanyId;
      if (!isRequesting && !isParty && user.role !== "admin") {
        return res.status(403).json({ message: "Not authorized to update this listing" });
      }
      const staffSharing = await storage.updateStaffSharingStatus(
        req.params.id,
        status,
        isRequesting ? user.companyId! : undefined,
      );
      if (!staffSharing) {
        return res.status(404).json({ message: "Staff sharing not found" });
      }
      res.json(staffSharing);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // === RESOURCE SHARING ROUTES ===
  app.get("/api/resource-sharing", requireAuth, async (req, res) => {
    const resourceType = req.query.resourceType as string | undefined;
    const resources = resourceType 
      ? await storage.getAvailableResourceSharing(resourceType)
      : await storage.getAllResourceSharing();
    res.json(resources);
  });

  app.post("/api/resource-sharing", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      if (!user.companyId) {
        return res.status(403).json({ message: "Company access required" });
      }

      const { providerCompanyId: _providerCompanyId, requesterCompanyId: _requesterCompanyId, ...rest } = req.body;
      const resourceData = insertResourceSharingSchema.parse({
        ...rest,
        providerCompanyId: user.companyId,
      });
      const resource = await storage.createResourceSharing(resourceData);
      res.status(201).json(resource);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/resource-sharing/:id/status", requireAuth, async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }
      const user = req.user as User;
      const existing = await storage.getResourceSharing(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Resource not found" });
      }
      // Any company can request an "available" listing; only the provider or the
      // already-matched requester (or an admin) may change its status afterwards.
      const isRequesting = status === "requested" && existing.status === "available";
      const isParty = user.companyId === existing.providerCompanyId || user.companyId === existing.requesterCompanyId;
      if (!isRequesting && !isParty && user.role !== "admin") {
        return res.status(403).json({ message: "Not authorized to update this listing" });
      }
      const resource = await storage.updateResourceSharingStatus(
        req.params.id,
        status,
        isRequesting ? user.companyId! : undefined,
      );
      if (!resource) {
        return res.status(404).json({ message: "Resource not found" });
      }
      res.json(resource);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // === ANNOUNCEMENTS / PROMO BOARD ROUTES ===
  app.get("/api/announcements", async (req, res) => {
    const announcements = await storage.getActiveAnnouncements();
    res.json(announcements);
  });

  app.get("/api/announcements/:id", async (req, res) => {
    const announcement = await storage.getAnnouncement(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }
    await storage.incrementAnnouncementViews(req.params.id);
    res.json(announcement);
  });

  app.post("/api/announcements", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const announcementData = insertAnnouncementSchema.parse(req.body);
      const announcement = await storage.createAnnouncement({
        ...announcementData,
        userId: user.id,
        companyId: user.companyId || null,
      });
      res.status(201).json(announcement);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/announcements/:id/click", async (req, res) => {
    const announcement = await storage.incrementAnnouncementClicks(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }
    res.json({ success: true });
  });

  // === STRIPE PAYMENT ROUTES ===
  app.post("/api/create-payment-intent", requireAuth, async (req, res) => {
    try {
      if (!isStripeConfigured()) {
        return res.status(503).json({ message: "Payments are not configured" });
      }
      const { amount, bookingId } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Valid amount is required" });
      }

      const paymentIntent = await getStripe().paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        // Escrow: hold the funds on the customer's card and only capture them
        // once delivery is confirmed (see the "delivered" branch of the booking
        // status route), or release them automatically if Stripe's hold expires.
        capture_method: "manual",
        metadata: { bookingId: bookingId || "" },
      });

      res.json({ 
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Payment intent creation failed: " + error.message });
    }
  });

  const PLAN_CONFIG: Record<string, { priceUsd: number; monthlyBookingLimit: number }> = {
    basic: { priceUsd: 49, monthlyBookingLimit: 50 },
    premium: { priceUsd: 149, monthlyBookingLimit: 300 },
    enterprise: { priceUsd: 299, monthlyBookingLimit: 1000 },
  };

  app.post("/api/companies/:id/subscribe", requireAuth, async (req, res) => {
    try {
      if (!isStripeConfigured()) {
        return res.status(503).json({ message: "Payments are not configured" });
      }
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      const user = req.user as User;
      if (user.companyId !== company.id && user.role !== "admin") {
        return res.status(403).json({ message: "Not authorized to manage this company's subscription" });
      }

      const plan = String(req.body.plan || "");
      const planConfig = PLAN_CONFIG[plan];
      if (!planConfig) {
        return res.status(400).json({ message: "Invalid plan. Choose basic, premium, or enterprise." });
      }

      // Only redirect back to this same app after checkout, never to an attacker-supplied
      // external domain: reject any successUrl/cancelUrl that doesn't resolve to our own host.
      const appOrigin = `${req.protocol}://${req.get("host")}`;
      const resolveOwnUrl = (raw: unknown, fallbackPath: string): string => {
        if (typeof raw === "string") {
          try {
            const parsed = new URL(raw, appOrigin);
            if (parsed.host === req.get("host")) {
              return parsed.toString();
            }
          } catch {
            // fall through to default
          }
        }
        return `${appOrigin}${fallbackPath}`;
      };

      const session = await getStripe().checkout.sessions.create({
        mode: "payment",
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "usd",
            product_data: { name: `Point to Point - ${plan} plan (monthly)` },
            unit_amount: planConfig.priceUsd * 100,
          },
        }],
        success_url: resolveOwnUrl(req.body.successUrl, "/console"),
        cancel_url: resolveOwnUrl(req.body.cancelUrl, "/plans"),
        metadata: { companyId: company.id, plan },
      });

      res.json({ url: session.url });
    } catch (error: any) {
      res.status(500).json({ message: "Checkout session creation failed: " + error.message });
    }
  });

  app.get("/api/companies/:id/usage", requireAuth, async (req, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      const user = req.user as User;
      if (user.companyId !== company.id && user.role !== "admin") {
        return res.status(403).json({ message: "Not authorized to view this company's usage" });
      }
      const used = await storage.getCompanyMonthlyBookingCount(company.id);
      const limit = company.monthlyBookingLimit ?? 0;
      res.json({
        subscriptionTier: company.subscriptionTier,
        monthlyBookingLimit: limit,
        used,
        remaining: limit > 0 ? Math.max(limit - used, 0) : null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // === BADGES & LEADERBOARD ROUTES ===
  app.get("/api/badges", async (_req, res) => {
    res.json(await storage.getAllBadges());
  });

  app.get("/api/badges/:holderType/:holderId", async (req, res) => {
    const { holderType, holderId } = req.params;
    if (holderType !== "company" && holderType !== "driver") {
      return res.status(400).json({ message: "holderType must be 'company' or 'driver'" });
    }
    res.json(await storage.getHolderBadges(holderType, holderId));
  });

  app.get("/api/leaderboard/companies", async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    res.json(await storage.getCompanyLeaderboard(limit));
  });

  app.get("/api/leaderboard/drivers", async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    res.json(await storage.getDriverLeaderboard(limit));
  });

  // === COUPON ROUTES ===
  app.post("/api/coupons", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      if (user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can create coupons" });
      }
      const couponData = insertCouponSchema.parse(req.body);
      const coupon = await storage.createCoupon(couponData);
      res.status(201).json(coupon);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/coupons/validate", requireAuth, async (req, res) => {
    const { code, amount } = req.body;
    const coupon = await storage.getCouponByCode(String(code || ""));
    const now = new Date();

    if (!coupon || !coupon.active) {
      return res.status(404).json({ message: "Invalid coupon code" });
    }
    if (coupon.validUntil && new Date(coupon.validUntil) < now) {
      return res.status(400).json({ message: "This coupon has expired" });
    }
    if (coupon.maxRedemptions !== null && (coupon.timesRedeemed ?? 0) >= coupon.maxRedemptions) {
      return res.status(400).json({ message: "This coupon has reached its redemption limit" });
    }
    if (amount !== undefined && Number(amount) < Number(coupon.minBookingAmount ?? 0)) {
      return res.status(400).json({ message: `Requires a minimum booking amount of ${coupon.minBookingAmount}` });
    }

    const discount = amount !== undefined
      ? (coupon.discountType === "percent" ? (Number(amount) * Number(coupon.discountValue)) / 100 : Number(coupon.discountValue))
      : undefined;

    res.json({ valid: true, coupon, estimatedDiscount: discount });
  });

  // === REFERRAL ROUTES ===
  app.get("/api/users/:id/referrals", requireAuth, async (req, res) => {
    const user = req.user as User;
    if (user.id !== req.params.id && user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }
    const target = await storage.getUser(req.params.id);
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }
    const rewards = await storage.getReferralRewards(req.params.id);
    res.json({ referralCode: target.referralCode, rewards });
  });

  app.post("/api/stripe-webhook", async (req, res) => {
    if (!isStripeConfigured()) {
      return res.status(503).send("Payments are not configured");
    }
    const sig = req.headers["stripe-signature"];

    if (!sig) {
      return res.status(400).send("No signature");
    }

    if (!req.rawBody) {
      return res.status(400).send("Missing raw request body");
    }

    try {
      const event = getStripe().webhooks.constructEvent(
        req.rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET || ""
      );

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const companyId = session.metadata?.companyId;
          const plan = session.metadata?.plan;
          const planConfig = plan ? PLAN_CONFIG[plan] : undefined;

          if (companyId && plan && planConfig) {
            await storage.upgradeCompanyPlan(companyId, plan, planConfig.monthlyBookingLimit);
            if (plan === "premium" || plan === "enterprise") {
              await storage.awardBadgeIfMissing("company", companyId, plan === "enterprise" ? "elite" : "premium");
            }
          }
          break;
        }

        case "payment_intent.amount_capturable_updated": {
          // The customer's card has been authorized (escrow hold placed).
          const authorizedIntent = event.data.object;
          const authorizedBookingId = authorizedIntent.metadata.bookingId;
          if (authorizedBookingId) {
            await storage.updateBookingPayment(authorizedBookingId, authorizedIntent.id, "authorized");
          }
          break;
        }

        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object;
          const bookingId = paymentIntent.metadata.bookingId;
          const roadServiceOrderId = paymentIntent.metadata.roadServiceOrderId;

          if (bookingId) {
            await storage.updateBookingPayment(
              bookingId,
              paymentIntent.id,
              "captured"
            );
          }
          if (roadServiceOrderId) {
            await handleRoadServiceOrderPayment(roadServiceOrderId, paymentIntent.id, true);
          }
          break;
        }

        case "payment_intent.payment_failed": {
          const failedIntent = event.data.object;
          const failedBookingId = failedIntent.metadata.bookingId;
          const failedRoadServiceOrderId = failedIntent.metadata.roadServiceOrderId;

          if (failedBookingId) {
            await storage.updateBookingPayment(
              failedBookingId,
              failedIntent.id,
              "failed"
            );
          }
          if (failedRoadServiceOrderId) {
            await handleRoadServiceOrderPayment(failedRoadServiceOrderId, failedIntent.id, false);
          }
          break;
        }
      }

      res.json({ received: true });
    } catch (err: any) {
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  });

  // === MAPBOX GEOCODING ROUTES ===
  app.post("/api/geocode", async (req, res) => {
    try {
      if (!isMapboxConfigured()) {
        return res.status(503).json({ message: "Mapping is not configured" });
      }
      const { address } = req.body;

      if (!address) {
        return res.status(400).json({ message: "Address is required" });
      }

      const response = await getGeocodingClient()
        .forwardGeocode({
          query: address,
          limit: 1,
        })
        .send();

      if (!response.body.features.length) {
        return res.status(404).json({ message: "Location not found" });
      }

      const feature = response.body.features[0];
      res.json({
        address: feature.place_name,
        coordinates: feature.geometry.coordinates,
        lat: feature.geometry.coordinates[1],
        lng: feature.geometry.coordinates[0],
      });
    } catch (error: any) {
      res.status(500).json({ message: "Geocoding failed: " + error.message });
    }
  });

  app.post("/api/calculate-route", async (req, res) => {
    try {
      if (!isMapboxConfigured()) {
        return res.status(503).json({ message: "Mapping is not configured" });
      }
      const { pickupLng, pickupLat, deliveryLng, deliveryLat, vehicleType } = req.body;

      if (!pickupLng || !pickupLat || !deliveryLng || !deliveryLat) {
        return res.status(400).json({ message: "All coordinates are required" });
      }

      const response = await getDirectionsClient()
        .getDirections({
          profile: "driving",
          waypoints: [
            { coordinates: [pickupLng, pickupLat] },
            { coordinates: [deliveryLng, deliveryLat] },
          ],
          geometries: "geojson",
        })
        .send();

      if (!response.body.routes.length) {
        return res.status(404).json({ message: "Route not found" });
      }

      const route = response.body.routes[0];
      const distanceInMiles = (route.distance / 1609.34).toFixed(2);
      const durationInMinutes = Math.round(route.duration / 60);
      
      // Calculate CO2 based on vehicle type (kg CO2 per mile)
      const emissionFactors: Record<string, number> = {
        'electric': 0,           // Electric vehicles - zero emissions
        'hybrid': 0.205,         // Hybrid vehicles - 50% of standard
        'van': 0.411,            // Standard diesel van
        'small-van': 0.32,       // Small van/car
        'truck': 0.617,          // Medium truck
        'large-truck': 0.823,    // Large truck/lorry
        'motorcycle': 0.149,     // Motorcycle
        'bicycle': 0,            // Bicycle - zero emissions
      };
      
      const emissionFactor = emissionFactors[vehicleType || 'van'] || 0.411;
      const co2EmissionKg = (parseFloat(distanceInMiles) * emissionFactor).toFixed(2);

      res.json({
        distance: parseFloat(distanceInMiles),
        duration: durationInMinutes,
        co2Emission: parseFloat(co2EmissionKg),
        geometry: route.geometry,
        vehicleType: vehicleType || 'van',
        emissionFactor,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Route calculation failed: " + error.message });
    }
  });

  // === DRIVER AVAILABILITY CALENDAR ===
  app.get("/api/drivers/:driverId/availability", async (req, res) => {
    res.json(await storage.getDriverAvailability(req.params.driverId));
  });

  app.put("/api/drivers/:driverId/availability", requireAuth, async (req, res) => {
    try {
      const driver = await storage.getDriver(req.params.driverId);
      if (!driver) return res.status(404).json({ message: "Driver not found" });
      const user = req.user as User;
      if (driver.userId !== user.id && user.companyId !== driver.companyId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const slots = (req.body.slots || []).map((s: any) => insertDriverAvailabilitySchema.parse(s));
      const saved = await storage.setDriverAvailability(req.params.driverId, slots);
      res.json(saved);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/drivers/:driverId/time-off", async (req, res) => {
    res.json(await storage.getDriverTimeOff(req.params.driverId));
  });

  app.post("/api/drivers/:driverId/time-off", requireAuth, async (req, res) => {
    try {
      const driver = await storage.getDriver(req.params.driverId);
      if (!driver) return res.status(404).json({ message: "Driver not found" });
      const user = req.user as User;
      if (driver.userId !== user.id && user.companyId !== driver.companyId && user.role !== "admin") {
        return res.status(403).json({ message: "Not authorized" });
      }
      const data = insertDriverTimeOffSchema.parse({ ...req.body, driverId: req.params.driverId });
      const created = await storage.createDriverTimeOff(data);
      res.status(201).json(created);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/drivers/:driverId/time-off/:id", requireAuth, async (req, res) => {
    const driver = await storage.getDriver(req.params.driverId);
    if (!driver) return res.status(404).json({ message: "Driver not found" });
    const user = req.user as User;
    if (driver.userId !== user.id && user.companyId !== driver.companyId && user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }
    const deleted = await storage.deleteDriverTimeOff(req.params.id, req.params.driverId);
    if (!deleted) return res.status(404).json({ message: "Time off entry not found" });
    res.status(204).send();
  });

  app.get("/api/companies/:companyId/available-drivers", requireAuth, async (req, res) => {
    const when = req.query.at ? new Date(String(req.query.at)) : new Date();
    res.json(await storage.findAvailableDrivers(req.params.companyId, when));
  });

  // === CALENDAR SYNC (Google / Outlook) ===
  app.get("/api/drivers/:driverId/calendar/:provider/auth-url", requireAuth, async (req, res) => {
    const driver = await storage.getDriver(req.params.driverId);
    if (!driver) return res.status(404).json({ message: "Driver not found" });
    const user = req.user as User;
    if (driver.userId !== user.id && user.companyId !== driver.companyId && user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }
    const provider = req.params.provider as CalendarProvider;
    if (provider !== "google" && provider !== "outlook") {
      return res.status(400).json({ message: "provider must be 'google' or 'outlook'" });
    }
    const syncProvider = getCalendarSyncProvider(provider);
    if (!syncProvider.isConfigured()) {
      return res.status(503).json({ message: `${provider} calendar sync is not configured on this server` });
    }
    const state = Buffer.from(JSON.stringify({ driverId: req.params.driverId, provider })).toString("base64url");
    res.json({ url: syncProvider.getAuthorizationUrl(state) });
  });

  app.get("/api/calendar/:provider/callback", async (req, res) => {
    try {
      const provider = req.params.provider as CalendarProvider;
      const { code, state } = req.query;
      if (!code || !state) return res.status(400).json({ message: "Missing code or state" });

      const { driverId } = JSON.parse(Buffer.from(String(state), "base64url").toString());
      const syncProvider = getCalendarSyncProvider(provider);
      const tokens = await syncProvider.exchangeCodeForTokens(String(code));
      await storage.upsertCalendarConnection(driverId, provider, tokens.accessToken, tokens.refreshToken, tokens.expiresAt);
      res.redirect("/settings?calendar_connected=" + provider);
    } catch (error: any) {
      res.status(400).json({ message: "Calendar connection failed: " + error.message });
    }
  });

  app.get("/api/drivers/:driverId/calendar/connections", requireAuth, async (req, res) => {
    const driver = await storage.getDriver(req.params.driverId);
    if (!driver) return res.status(404).json({ message: "Driver not found" });
    const user = req.user as User;
    if (driver.userId !== user.id && user.companyId !== driver.companyId && user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }
    const connections = await storage.getDriverCalendarConnections(req.params.driverId);
    res.json(connections.map(({ accessTokenEncrypted: _at, refreshTokenEncrypted: _rt, ...rest }) => rest));
  });

  app.delete("/api/drivers/:driverId/calendar/:provider", requireAuth, async (req, res) => {
    const driver = await storage.getDriver(req.params.driverId);
    if (!driver) return res.status(404).json({ message: "Driver not found" });
    const user = req.user as User;
    if (driver.userId !== user.id && user.companyId !== driver.companyId && user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }
    const deleted = await storage.deleteCalendarConnection(req.params.driverId, req.params.provider);
    if (!deleted) return res.status(404).json({ message: "Connection not found" });
    res.status(204).send();
  });

  app.post("/api/bookings/:bookingId/sync-to-calendar", requireAuth, async (req, res) => {
    try {
      const booking = await storage.getBooking(req.params.bookingId);
      if (!booking || !booking.driverId) {
        return res.status(404).json({ message: "Booking or assigned driver not found" });
      }
      if (!(await userCanAccessBooking(req.user as User, booking))) {
        return res.status(403).json({ message: "Not authorized to sync this booking" });
      }
      const connections = await storage.getDriverCalendarConnections(booking.driverId);
      const results: Record<string, string> = {};
      for (const connection of connections) {
        if (!connection.syncEnabled) continue;
        const syncProvider = getCalendarSyncProvider(connection.provider as CalendarProvider);
        const { accessToken } = storage.decryptCalendarTokens(connection);
        const start = new Date(booking.pickupDate);
        const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
        const event = await syncProvider.createEvent(accessToken, {
          title: `Point to Point job: ${booking.pickupAddress} -> ${booking.deliveryAddress}`,
          description: booking.notes || undefined,
          startIso: start.toISOString(),
          endIso: end.toISOString(),
          location: booking.pickupAddress,
        });
        await storage.touchCalendarSync(connection.id);
        results[connection.provider] = event.externalEventId;
      }
      res.json({ synced: results });
    } catch (error: any) {
      res.status(400).json({ message: "Calendar sync failed: " + error.message });
    }
  });

  // === AI CARGO RECOGNITION ===
  app.post("/api/bookings/:bookingId/cargo-items/analyze", requireAuth, aiLimiter, async (req, res) => {
    try {
      const { imageUrl } = req.body;
      if (!imageUrl) return res.status(400).json({ message: "imageUrl is required" });
      if (typeof imageUrl === "string" && imageUrl.startsWith("data:")) {
        validateDataUrl(imageUrl, { allowedMimeTypes: IMAGE_MIME_TYPES, maxBytes: MAX_UPLOAD_BYTES });
      }

      const booking = await storage.getBooking(req.params.bookingId);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      if (!(await userCanAccessBooking(req.user as User, booking))) {
        return res.status(403).json({ message: "Not authorized to analyze cargo for this booking" });
      }

      const recognitionProvider = getCargoRecognitionProvider();
      if (!recognitionProvider.isConfigured()) {
        return res.status(503).json({ message: "AI cargo recognition is not configured (ANTHROPIC_API_KEY missing)" });
      }

      const result = await recognitionProvider.analyzeImage(imageUrl);
      const cargoItem = await storage.createCargoItem({
        bookingId: req.params.bookingId,
        imageUrl,
        detectedLabel: result.detectedLabel,
        category: result.category,
        estimatedLengthCm: result.estimatedLengthCm.toString(),
        estimatedWidthCm: result.estimatedWidthCm.toString(),
        estimatedHeightCm: result.estimatedHeightCm.toString(),
        estimatedVolumeM3: result.estimatedVolumeM3.toString(),
        estimatedWeightKg: result.estimatedWeightKg.toString(),
        fragile: result.fragile,
        suggestedVehicleType: result.suggestedVehicleType,
        confidence: result.confidence.toString(),
        aiProvider: result.provider,
        rawResponse: result.raw as Record<string, unknown>,
      });
      res.status(201).json(cargoItem);
    } catch (error: any) {
      res.status(500).json({ message: "Cargo analysis failed: " + error.message });
    }
  });

  app.get("/api/bookings/:bookingId/cargo-items", requireAuth, async (req, res) => {
    const booking = await storage.getBooking(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (!(await userCanAccessBooking(req.user as User, booking))) {
      return res.status(403).json({ message: "Not authorized to view this booking's cargo items" });
    }
    res.json(await storage.getBookingCargoItems(req.params.bookingId));
  });

  app.post("/api/cargo-items", requireAuth, async (req, res) => {
    try {
      const data = insertCargoItemSchema.parse(req.body);
      if (data.imageUrl.startsWith("data:")) {
        validateDataUrl(data.imageUrl, { allowedMimeTypes: IMAGE_MIME_TYPES, maxBytes: MAX_UPLOAD_BYTES });
      }
      const booking = await storage.getBooking(data.bookingId);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      if (!(await userCanAccessBooking(req.user as User, booking))) {
        return res.status(403).json({ message: "Not authorized to add cargo items to this booking" });
      }
      const created = await storage.createCargoItem(data);
      res.status(201).json(created);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/cargo-items/:id/correct", requireAuth, async (req, res) => {
    const existingItem = await storage.getCargoItem(req.params.id);
    if (!existingItem) return res.status(404).json({ message: "Cargo item not found" });
    const itemBooking = await storage.getBooking(existingItem.bookingId);
    if (!itemBooking || !(await userCanAccessBooking(req.user as User, itemBooking))) {
      return res.status(403).json({ message: "Not authorized to correct this cargo item" });
    }
    const updated = await storage.correctCargoItem(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Cargo item not found" });
    res.json(updated);
  });

  // === AI MULTILINGUAL CHAT TRANSLATION ===
  app.post("/api/messages/:messageId/translate", requireAuth, aiLimiter, async (req, res) => {
    try {
      const { targetLanguage } = req.body;
      if (!targetLanguage) return res.status(400).json({ message: "targetLanguage is required" });

      const existing = await storage.getMessageTranslation(req.params.messageId, targetLanguage);
      if (existing) return res.json(existing);

      const messageResult = await db.select().from(messages)
        .where(eq(messages.id, req.params.messageId));
      const message = messageResult[0];
      if (!message) return res.status(404).json({ message: "Message not found" });

      const messageBooking = await storage.getBooking(message.bookingId);
      if (!messageBooking || !(await userCanAccessBooking(req.user as User, messageBooking))) {
        return res.status(403).json({ message: "Not authorized to translate this message" });
      }

      const translationProvider = getTranslationProvider();
      if (!translationProvider.isConfigured()) {
        return res.status(503).json({ message: "AI translation is not configured (ANTHROPIC_API_KEY missing)" });
      }

      const result = await translationProvider.translate(message.content, targetLanguage);
      const translation = await storage.createMessageTranslation(
        req.params.messageId,
        result.detectedSourceLanguage,
        targetLanguage,
        result.translatedText,
        result.provider,
      );
      res.status(201).json(translation);
    } catch (error: any) {
      res.status(500).json({ message: "Translation failed: " + error.message });
    }
  });

  // === VOICE / VIDEO CALLS ===
  app.get("/api/webrtc/ice-config", requireAuth, (_req, res) => {
    const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [
      { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    ];
    if (process.env.TURN_SERVER_URL) {
      iceServers.push({
        urls: process.env.TURN_SERVER_URL,
        username: process.env.TURN_SERVER_USERNAME,
        credential: process.env.TURN_SERVER_CREDENTIAL,
      });
    }
    res.json({ iceServers });
  });

  app.get("/api/users/:userId/calls", requireAuth, async (req, res) => {
    const user = req.user as User;
    if (user.id !== req.params.userId) return res.status(403).json({ message: "Not authorized" });
    res.json(await storage.getUserCallHistory(req.params.userId));
  });

  app.get("/api/calls/:id", requireAuth, async (req, res) => {
    const call = await storage.getCall(req.params.id);
    if (!call) return res.status(404).json({ message: "Call not found" });
    const user = req.user as User;
    if (call.callerId !== user.id && call.calleeId !== user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }
    res.json(call);
  });

  app.patch("/api/calls/:id/quality", requireAuth, async (req, res) => {
    const updated = await storage.updateCallStatus(req.params.id, req.body.status || "completed", req.body.quality);
    if (!updated) return res.status(404).json({ message: "Call not found" });
    res.json(updated);
  });

  // === IDENTITY VERIFICATION ===
  app.post("/api/verification-documents", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const data = insertVerificationDocumentSchema.parse(req.body);
      if (data.fileUrl.startsWith("data:")) {
        validateDataUrl(data.fileUrl, { allowedMimeTypes: DOCUMENT_MIME_TYPES, maxBytes: MAX_UPLOAD_BYTES });
      }
      if (!(await userCanAccessVerificationHolder(user, data.holderType, data.holderId))) {
        return res.status(403).json({ message: "Cannot submit documents for this holder" });
      }
      const doc = await storage.createVerificationDocument(data);
      res.status(201).json(doc);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/verification-documents/:holderType/:holderId", requireAuth, async (req, res) => {
    const user = req.user as User;
    if (!(await userCanAccessVerificationHolder(user, req.params.holderType, req.params.holderId))) {
      return res.status(403).json({ message: "Not authorized to view these documents" });
    }
    res.json(await storage.getHolderVerificationDocuments(req.params.holderType, req.params.holderId));
  });

  app.get("/api/admin/verification-documents/pending", requireAuth, async (req, res) => {
    const user = req.user as User;
    if (user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    res.json(await storage.getPendingVerificationDocuments());
  });

  app.patch("/api/admin/verification-documents/:id/review", requireAuth, async (req, res) => {
    const user = req.user as User;
    if (user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const { status, rejectionReason } = req.body;
    if (status !== "approved" && status !== "rejected") {
      return res.status(400).json({ message: "status must be 'approved' or 'rejected'" });
    }
    const updated = await storage.reviewVerificationDocument(req.params.id, status, user.id, rejectionReason);
    if (!updated) return res.status(404).json({ message: "Document not found" });

    if (status === "approved" && updated.holderType === "company") {
      await storage.verifyCompany(updated.holderId, true);
    }
    res.json(updated);
  });

  // === FRAUD PREVENTION ===
  app.post("/api/fraud/device-fingerprint", requireAuth, async (req, res) => {
    const user = req.user as User;
    const { fingerprintHash } = req.body;
    if (!fingerprintHash) return res.status(400).json({ message: "fingerprintHash is required" });

    await storage.recordDeviceFingerprint(user.id, fingerprintHash, req.headers["user-agent"], req.ip);
    const duplicateCheck = await checkDuplicateAccount(user.id, user.phone, fingerprintHash);

    if (duplicateCheck.isDuplicate) {
      await storage.recordRiskScore("user", user.id, 60, duplicateCheck.reasons);
      await storage.writeAuditLog(user.id, "duplicate_account_flagged", "user", user.id, duplicateCheck, req.ip);
    }
    res.json({ ok: true, duplicateCheck });
  });

  app.get("/api/admin/risk-scores/:subjectType/:subjectId", requireAuth, async (req, res) => {
    const user = req.user as User;
    if (user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const score = await storage.getLatestRiskScore(req.params.subjectType, req.params.subjectId);
    res.json(score || { subjectType: req.params.subjectType, subjectId: req.params.subjectId, score: 0, reasons: [] });
  });

  app.get("/api/admin/audit-logs", requireAuth, async (req, res) => {
    const user = req.user as User;
    if (user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const targetType = req.query.targetType ? String(req.query.targetType) : undefined;
    const targetId = req.query.targetId ? String(req.query.targetId) : undefined;
    res.json(await storage.getAuditLogs(targetType, targetId));
  });

  // GPS anomaly detection: called whenever a new tracking update is created
  app.post("/api/tracking/:bookingId/check-anomaly", requireAuth, async (req, res) => {
    const anomalyBooking = await storage.getBooking(req.params.bookingId);
    if (!anomalyBooking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (!(await userCanAccessBooking(req.user as User, anomalyBooking))) {
      return res.status(403).json({ message: "Not authorized to check this booking's tracking" });
    }
    const updates = await storage.getBookingTracking(req.params.bookingId);
    if (updates.length < 2) return res.json({ anomalous: false });

    const [latest, previous] = [updates[updates.length - 1], updates[updates.length - 2]];
    const result = checkGpsAnomaly(
      { lat: Number(previous.lat), lng: Number(previous.lng), createdAt: new Date(previous.createdAt) },
      { lat: Number(latest.lat), lng: Number(latest.lng), createdAt: new Date(latest.createdAt) },
    );

    if (result.anomalous) {
      await storage.recordRiskScore("booking", req.params.bookingId, 50, [result.reason!]);
      await storage.writeAuditLog(undefined, "gps_anomaly_detected", "booking", req.params.bookingId, result, req.ip);
    }
    res.json(result);
  });

  // === PARTNER API: API KEY MANAGEMENT (company-owner facing) ===
  app.post("/api/companies/:companyId/api-keys", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      if (user.companyId !== req.params.companyId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const data = insertApiKeySchema.parse({ ...req.body, companyId: req.params.companyId });
      const { rawKey, prefix } = generateApiKey();
      const created = await storage.createApiKey(data, hashApiKey(rawKey), prefix);
      // Return the raw key only once, at creation time
      res.status(201).json({ ...created, rawKey });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/companies/:companyId/api-keys", requireAuth, async (req, res) => {
    const user = req.user as User;
    if (user.companyId !== req.params.companyId) {
      return res.status(403).json({ message: "Not authorized" });
    }
    const keys = await storage.getCompanyApiKeys(req.params.companyId);
    res.json(keys.map(({ keyHash: _keyHash, ...rest }) => rest));
  });

  app.delete("/api/companies/:companyId/api-keys/:id", requireAuth, async (req, res) => {
    const user = req.user as User;
    if (user.companyId !== req.params.companyId) {
      return res.status(403).json({ message: "Not authorized" });
    }
    const revoked = await storage.revokeApiKey(req.params.id, req.params.companyId);
    if (!revoked) return res.status(404).json({ message: "API key not found" });
    res.status(204).send();
  });

  const httpServer = createServer(app);
  return httpServer;
}
