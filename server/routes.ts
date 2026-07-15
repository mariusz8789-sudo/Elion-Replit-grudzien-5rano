import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { getStripe, isStripeConfigured } from "./stripe";
import { getGeocodingClient, getDirectionsClient, isMapboxConfigured } from "./mapbox";
import { passport } from "./auth";
import { db } from "./db";
import { eq, and, gte, sql, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  insertServiceSchema, insertBookingSchema, insertQuoteSchema, insertUserSchema,
  insertCompanySchema, insertDriverSchema, insertVehicleSchema, insertOfferSchema,
  insertMessageSchema, insertAttachmentSchema, insertReviewSchema,
  insertTrackingUpdateSchema, insertNotificationSchema, insertMarketplaceListingSchema,
  insertSharedRideSchema, insertStaffSharingSchema,
  insertResourceSharingSchema, insertAnnouncementSchema, insertCouponSchema,
  insertCapacityPostingSchema, insertCapacityBookingSchema,
  insertDriverAvailabilitySchema, insertDriverTimeOffSchema, insertCargoItemSchema,
  insertVerificationDocumentSchema, insertApiKeySchema,
  insertSkillSchema, insertWorkerProfileSchema, insertWorkerSkillSchema,
  offers, marketplaceListings, sharedRides, rideBookings, companies, bookings, drivers, vehicles,
  users, messages, reviews, services
} from "@shared/schema";
import type { User, Booking } from "@shared/schema";
import { getCalendarSyncProvider, type CalendarProvider } from "./services/calendarSync";
import { getCargoRecognitionProvider } from "./services/cargoRecognition";
import { getTranslationProvider } from "./services/translation";
import { checkGpsAnomaly, checkDuplicateAccount } from "./services/fraud";
import { calculateCapacityBookingPrice } from "./lib/capacityPricing";
import { calculateTripEnvironmentalSummary, BASELINE_VEHICLE_CLASS, calculateEmissionsKg, normalizeVehicleType, EMISSION_FACTORS_KG_PER_KM, ECO_METHODOLOGY, ECO_METHODOLOGY_VERSION } from "@shared/environmentalCalculation";
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

// Recomputes and persists the booking's CO2 estimate now that a real vehicle is assigned -
// called from both the direct company-assignment route and offer acceptance, the two paths
// that can attach a vehicleId to a booking after its initial (baseline-only) estimate.
async function recomputeBookingEnvironmentalImpact(bookingId: string, vehicleId: string | null) {
  const booking = await storage.getBooking(bookingId);
  if (!booking) return;
  const vehicle = vehicleId ? await storage.getVehicle(vehicleId) : undefined;
  const distanceKm = Number(booking.estimatedDistance) * 1.60934;
  const co2Summary = calculateTripEnvironmentalSummary(distanceKm, vehicle?.type);

  await storage.updateBookingCo2(bookingId, String(co2Summary.estimatedCo2Kg));
  await storage.createEnvironmentalCalculation({
    bookingId,
    distanceKm: co2Summary.distanceKm,
    vehicleType: co2Summary.vehicleType,
    estimatedCo2Kg: co2Summary.estimatedCo2Kg,
    baselineVehicleType: co2Summary.baselineVehicleType,
    baselineCo2Kg: co2Summary.baselineCo2Kg,
    co2SavedKg: co2Summary.co2SavedKg,
    methodology: co2Summary.methodology,
    methodologyVersion: co2Summary.methodologyVersion,
  });
}

// Shared by the tracking-creation route (runs automatically on every new GPS update) and
// the standalone /check-anomaly endpoint (for an on-demand re-check), so the detection
// logic and its risk-score/audit-log side effects live in exactly one place.
async function runGpsAnomalyCheck(bookingId: string, ip: string | undefined) {
  const updates = await storage.getBookingTracking(bookingId);
  if (updates.length < 2) return { anomalous: false as const };

  const [latest, previous] = [updates[updates.length - 1], updates[updates.length - 2]];
  const result = checkGpsAnomaly(
    { lat: Number(previous.lat), lng: Number(previous.lng), createdAt: new Date(previous.createdAt) },
    { lat: Number(latest.lat), lng: Number(latest.lng), createdAt: new Date(latest.createdAt) },
  );

  if (result.anomalous) {
    await storage.recordRiskScore("booking", bookingId, 50, [result.reason!]);
    await storage.writeAuditLog(undefined, "gps_anomaly_detected", "booking", bookingId, result, ip);
  }
  return result;
}

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
      const user = req.user as User;
      // The booking's owner is always the authenticated caller - a client-supplied userId
      // in the body must never be trusted, or any user could create a booking (and its
      // downstream payment/tracking/review obligations) under someone else's identity.
      const bookingData = insertBookingSchema.parse({ ...req.body, userId: user.id });

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

      // CO2 is always computed server-side from the shared, versioned methodology - never
      // trusted from the client. No vehicle is assigned yet at creation time, so the estimate
      // uses the baseline vehicle class itself (van), meaning zero "savings" are claimed
      // until a real vehicle is assigned and the estimate is recomputed (see PATCH
      // /api/bookings/:id/assign and the offer-acceptance flow).
      const distanceKm = Number(bookingData.estimatedDistance) * 1.60934;
      const co2Summary = calculateTripEnvironmentalSummary(distanceKm, BASELINE_VEHICLE_CLASS);

      const booking = await storage.createBooking({
        ...bookingData,
        totalPrice: finalPrice,
        discountAmount,
        co2Emission: String(co2Summary.estimatedCo2Kg),
      });

      await storage.createEnvironmentalCalculation({
        bookingId: booking.id,
        distanceKm: co2Summary.distanceKm,
        vehicleType: co2Summary.vehicleType,
        estimatedCo2Kg: co2Summary.estimatedCo2Kg,
        baselineVehicleType: co2Summary.baselineVehicleType,
        baselineCo2Kg: co2Summary.baselineCo2Kg,
        co2SavedKg: co2Summary.co2SavedKg,
        methodology: co2Summary.methodology,
        methodologyVersion: co2Summary.methodologyVersion,
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
      await recomputeBookingEnvironmentalImpact(booking.id, vehicleId);
      res.json(booking);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // === QR/NFC DISPATCH ROUTES ===
  // Jobs the company has already accepted but hasn't handed to a specific driver yet - these
  // are what a dispatcher can generate a real QR code for.
  app.get("/api/companies/:companyId/dispatch-jobs", requireAuth, async (req, res) => {
    const user = req.user as User;
    if (user.companyId !== req.params.companyId && user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }
    const jobs = await storage.getCompanyUnassignedBookings(req.params.companyId);
    res.json(jobs);
  });

  // A driver scans (or NFC-taps) a job's QR code, which encodes nothing but the bookingId -
  // all authorization is re-checked server-side against the scanning driver's own company
  // membership, so the QR content itself doesn't need to be signed or trusted.
  app.post("/api/bookings/:id/claim", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const driver = await storage.getDriverByUserId(user.id);
      if (!driver) {
        return res.status(403).json({ message: "Only drivers can claim jobs" });
      }
      const claimed = await storage.claimBookingForDriver(req.params.id, driver.id, driver.companyId);
      if (!claimed) {
        return res.status(409).json({ message: "This job is no longer available - it may already be claimed or not assigned to your company" });
      }
      await storage.createNotification({
        userId: claimed.userId,
        title: "Driver assigned",
        message: `A driver has been dispatched to your booking.`,
        link: `/bookings/${claimed.id}`,
      });
      res.json(claimed);
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
      await storage.createNotification({
        userId: booking.userId,
        title: "New offer received",
        message: `You received a new offer of $${offer.price} on your booking.`,
        type: "info",
        link: `/bookings/${booking.id}`,
      });
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
      await recomputeBookingEnvironmentalImpact(offer.bookingId, offer.vehicleId ?? null);
      if (offer.companyId) {
        const companyUsers = await storage.getCompanyUsers(offer.companyId);
        await Promise.all(companyUsers.map((u) => storage.createNotification({
          userId: u.id,
          title: "Your offer was accepted",
          message: `Your offer of $${offer.price} was accepted. The job is now yours.`,
          type: "success",
          link: `/bookings/${offer.bookingId}`,
        })));
      }
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

      // Real rating distribution and average from this company's actual reviews - previously
      // both were fixed percentages/values shown for every company regardless of any real
      // review data.
      const companyReviews = await db.select().from(reviews).where(eq(reviews.companyId, user.companyId));
      const RATING_LABELS: Record<number, string> = {
        5: "Excellent (5★)", 4: "Good (4★)", 3: "Average (3★)", 2: "Poor (2★)", 1: "Bad (1★)",
      };
      const ratingCounts = [5, 4, 3, 2, 1].reduce((acc, star) => {
        acc[star] = companyReviews.filter((r) => r.rating === star).length;
        return acc;
      }, {} as Record<number, number>);
      const ratings = [5, 4, 3, 2, 1].map((star) => ({
        category: RATING_LABELS[star],
        count: ratingCounts[star],
        percent: companyReviews.length > 0 ? Math.round((ratingCounts[star] / companyReviews.length) * 1000) / 10 : 0,
      }));
      const avgRating = companyReviews.length > 0
        ? Math.round((companyReviews.reduce((sum, r) => sum + r.rating, 0) / companyReviews.length) * 10) / 10
        : 0;

      // Real top services by actual booking count for this company, not fixed percentages of
      // totalBookings applied to fake service names.
      const bookingCountByService = new Map<string, number>();
      bookingsData.forEach((b) => {
        bookingCountByService.set(b.serviceId, (bookingCountByService.get(b.serviceId) || 0) + 1);
      });
      const serviceIds = Array.from(bookingCountByService.keys());
      const serviceRows = serviceIds.length > 0
        ? await db.select().from(services).where(inArray(services.id, serviceIds))
        : [];
      const serviceNameById = new Map(serviceRows.map((s) => [s.id, s.name]));
      const topServices = Array.from(bookingCountByService.entries())
        .map(([serviceId, count]) => ({ name: serviceNameById.get(serviceId) || "Unknown Service", count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const analytics = {
        revenue,
        bookings: bookingsChart,
        ratings,
        topServices,
        stats: {
          totalRevenue: Math.round(totalRevenue),
          totalBookings,
          avgRating,
          totalReviews: companyReviews.length,
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

  // Fleet Predictor: real deterministic aggregates over this company's own booking history
  // (day-of-week averages, hour-of-day distribution, top pickup locations, period-over-period
  // trend). This replaces entirely hardcoded demand/hot-zone/peak-hour arrays and a fake "96%
  // AI confidence" badge. There is no trained forecasting model behind this - it is honest
  // historical statistics, with the actual ML/demand-forecasting model left as documented
  // future work (MoveX AI Core) rather than being faked here.
  app.get("/api/fleet-predictor", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      if (!user.companyId) {
        return res.status(403).json({ message: "Company access required" });
      }

      const bookingsData = await db.select().from(bookings).where(eq(bookings.companyId, user.companyId));
      const MIN_BOOKINGS_FOR_STATS = 5;
      if (bookingsData.length < MIN_BOOKINGS_FOR_STATS) {
        return res.json({ hasData: false, totalBookingsAnalyzed: bookingsData.length, methodology: "historical-aggregate-v1" });
      }

      const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const weekdayCounts = new Array(7).fill(0);
      const weekdayRevenue = new Array(7).fill(0);
      const hourCounts = new Array(24).fill(0);
      const hourRevenue = new Array(24).fill(0);
      const locationCounts = new Map<string, number>();
      let earliestDate = new Date(bookingsData[0].pickupDate);
      let latestDate = new Date(bookingsData[0].pickupDate);

      for (const b of bookingsData) {
        const date = new Date(b.pickupDate);
        const price = parseFloat(b.totalPrice.toString());
        const weekday = date.getDay();
        const hour = date.getHours();
        weekdayCounts[weekday]++;
        weekdayRevenue[weekday] += price;
        hourCounts[hour]++;
        hourRevenue[hour] += price;
        locationCounts.set(b.pickupAddress, (locationCounts.get(b.pickupAddress) || 0) + 1);
        if (date < earliestDate) earliestDate = date;
        if (date > latestDate) latestDate = date;
      }

      // How many times has each weekday actually occurred within the observed date range -
      // used as the divisor so "average bookings on a Friday" is a genuine per-occurrence mean.
      const weekdayOccurrences = new Array(7).fill(0);
      const dayMs = 24 * 60 * 60 * 1000;
      const spanDays = Math.max(1, Math.round((latestDate.getTime() - earliestDate.getTime()) / dayMs) + 1);
      for (let i = 0; i < spanDays; i++) {
        const d = new Date(earliestDate.getTime() + i * dayMs);
        weekdayOccurrences[d.getDay()]++;
      }

      const weekdayStats = WEEKDAY_LABELS.map((label, idx) => {
        const occurrences = weekdayOccurrences[idx] || 1;
        return {
          day: label,
          avgBookings: Math.round((weekdayCounts[idx] / occurrences) * 10) / 10,
          avgRevenue: weekdayCounts[idx] > 0 ? Math.round(weekdayRevenue[idx] / weekdayCounts[idx]) : 0,
          totalBookings: weekdayCounts[idx],
        };
      });
      const peakWeekday = weekdayStats.reduce((best, w) => (w.avgBookings > best.avgBookings ? w : best), weekdayStats[0]);

      // Real period-over-period trend: bookings in the most recent 4 weeks vs. the 4 weeks
      // before that, both measured from "now" - not a projection, an actual comparison.
      const now = new Date();
      const fourWeeksMs = 28 * dayMs;
      const recentCount = bookingsData.filter((b) => {
        const t = new Date(b.pickupDate).getTime();
        return t > now.getTime() - fourWeeksMs && t <= now.getTime();
      }).length;
      const previousCount = bookingsData.filter((b) => {
        const t = new Date(b.pickupDate).getTime();
        return t > now.getTime() - 2 * fourWeeksMs && t <= now.getTime() - fourWeeksMs;
      }).length;
      const trendPercent = previousCount > 0
        ? Math.round(((recentCount - previousCount) / previousCount) * 1000) / 10
        : null;

      const HOUR_BINS = [
        { label: "0-4", hours: [0, 1, 2, 3] },
        { label: "4-8", hours: [4, 5, 6, 7] },
        { label: "8-12", hours: [8, 9, 10, 11] },
        { label: "12-16", hours: [12, 13, 14, 15] },
        { label: "16-20", hours: [16, 17, 18, 19] },
        { label: "20-24", hours: [20, 21, 22, 23] },
      ];
      const totalBookingCount = bookingsData.length;
      const hourlyStats = HOUR_BINS.map((bin) => {
        const count = bin.hours.reduce((sum, h) => sum + hourCounts[h], 0);
        const revenue = bin.hours.reduce((sum, h) => sum + hourRevenue[h], 0);
        return {
          hour: bin.label,
          bookingCount: count,
          sharePercent: totalBookingCount > 0 ? Math.round((count / totalBookingCount) * 1000) / 10 : 0,
          avgRevenue: count > 0 ? Math.round(revenue / count) : 0,
        };
      }).sort((a, b) => b.bookingCount - a.bookingCount);

      const topLocations = Array.from(locationCounts.entries())
        .map(([address, count]) => ({ address, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      res.json({
        hasData: true,
        totalBookingsAnalyzed: totalBookingCount,
        observedFrom: earliestDate.toISOString(),
        observedTo: latestDate.toISOString(),
        weekdayStats,
        peakWeekday: peakWeekday.day,
        trendPercent,
        hourlyStats,
        topLocations,
        methodology: "historical-aggregate-v1",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Real per-company CO2 aggregates from persisted environmental_calculations - previously
  // this endpoint returned entirely Math.random() numbers dressed up with real company
  // names. Companies with no completed bookings yet simply show zero, not a fabricated
  // number, and the previously-invented electricVehiclePercent/ecoRating fields (there is
  // no vehicle "electric" type or rating methodology backing them) have been removed rather
  // than kept fake.
  app.get("/api/eco/companies", async (req, res) => {
    try {
      const companiesList = await db.select().from(companies).where(eq(companies.verified, true)).limit(20);
      const ecoCompanies = await Promise.all(companiesList.map(async (c) => {
        const summary = await storage.getCompanyEnvironmentalSummary(c.id);
        return {
          id: c.id,
          name: c.name,
          totalTrips: summary.totalTrips,
          totalCO2kg: summary.totalCo2Kg,
          totalCO2SavedKg: summary.totalCo2SavedKg,
          avgCO2PerTrip: summary.avgCo2PerTripKg,
        };
      }));
      res.json(ecoCompanies.filter((c) => c.totalTrips > 0).sort((a, b) => b.totalCO2SavedKg - a.totalCO2SavedKg).slice(0, 5));
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
      // Fire-and-forget: a slow/failed fraud check must never block a real-time GPS update
      // from being recorded and broadcast.
      runGpsAnomalyCheck(trackingData.bookingId, req.ip).catch((err) => {
        console.error("GPS anomaly check failed:", err.message);
      });
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
      const user = req.user as User;
      const existing = await storage.getStaffSharing(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Staff sharing not found" });
      }

      // A real state machine, not a free-for-all status field: only the lender may
      // accept/reject a request, and neither party can skip straight to "booked"
      // without the other's action. The conditional update in storage also guards
      // against two concurrent transitions racing on the same row.
      let result;
      switch (status) {
        case "requested": {
          if (!user.companyId || user.companyId === existing.lenderCompanyId) {
            return res.status(403).json({ message: "You cannot request your own listing" });
          }
          result = await storage.updateStaffSharingStatus(req.params.id, ["available"], "requested", user.companyId);
          if (result) {
            await storage.createNotification({
              userId: (await storage.getCompanyUsers(existing.lenderCompanyId))[0]?.id ?? "",
              title: "New request for your listing",
              message: `A company requested your ${existing.staffType} listing.`,
              type: "info",
              link: "/workshare",
            }).catch(() => undefined);
          }
          break;
        }
        case "booked": {
          if (user.companyId !== existing.lenderCompanyId && user.role !== "admin") {
            return res.status(403).json({ message: "Only the lender can accept a request" });
          }
          result = await storage.updateStaffSharingStatus(req.params.id, ["requested"], "booked");
          break;
        }
        case "available": {
          if (user.companyId !== existing.lenderCompanyId && user.role !== "admin") {
            return res.status(403).json({ message: "Only the lender can reject a request" });
          }
          result = await storage.updateStaffSharingStatus(req.params.id, ["requested"], "available", null);
          break;
        }
        case "completed": {
          const isParty = user.companyId === existing.lenderCompanyId || user.companyId === existing.borrowerCompanyId;
          if (!isParty && user.role !== "admin") {
            return res.status(403).json({ message: "Not authorized to complete this listing" });
          }
          result = await storage.updateStaffSharingStatus(req.params.id, ["booked"], "completed");
          break;
        }
        case "cancelled": {
          const isParty = user.companyId === existing.lenderCompanyId || user.companyId === existing.borrowerCompanyId;
          if (!isParty && user.role !== "admin") {
            return res.status(403).json({ message: "Not authorized to cancel this listing" });
          }
          result = await storage.updateStaffSharingStatus(req.params.id, ["requested", "booked"], "cancelled");
          break;
        }
        default:
          return res.status(400).json({ message: "Invalid status" });
      }

      if (!result) {
        return res.status(409).json({ message: "This listing is no longer in the expected state - it may have already been updated." });
      }
      res.json(result);
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
      const user = req.user as User;
      const existing = await storage.getResourceSharing(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Resource not found" });
      }

      // Same state machine as staff-sharing: only the provider may accept/reject a
      // request, and the conditional update guards against a race between two
      // concurrent transitions on the same listing.
      let resource;
      switch (status) {
        case "requested": {
          if (!user.companyId || user.companyId === existing.providerCompanyId) {
            return res.status(403).json({ message: "You cannot request your own listing" });
          }
          resource = await storage.updateResourceSharingStatus(req.params.id, ["available"], "requested", user.companyId);
          if (resource) {
            await storage.createNotification({
              userId: (await storage.getCompanyUsers(existing.providerCompanyId))[0]?.id ?? "",
              title: "New request for your listing",
              message: `A company requested your "${existing.title}" listing.`,
              type: "info",
              link: "/workshare",
            }).catch(() => undefined);
          }
          break;
        }
        case "booked": {
          if (user.companyId !== existing.providerCompanyId && user.role !== "admin") {
            return res.status(403).json({ message: "Only the provider can accept a request" });
          }
          resource = await storage.updateResourceSharingStatus(req.params.id, ["requested"], "booked");
          break;
        }
        case "available": {
          if (user.companyId !== existing.providerCompanyId && user.role !== "admin") {
            return res.status(403).json({ message: "Only the provider can reject a request" });
          }
          resource = await storage.updateResourceSharingStatus(req.params.id, ["requested"], "available", null);
          break;
        }
        case "completed": {
          const isParty = user.companyId === existing.providerCompanyId || user.companyId === existing.requesterCompanyId;
          if (!isParty && user.role !== "admin") {
            return res.status(403).json({ message: "Not authorized to complete this listing" });
          }
          resource = await storage.updateResourceSharingStatus(req.params.id, ["booked"], "completed");
          break;
        }
        case "cancelled": {
          const isParty = user.companyId === existing.providerCompanyId || user.companyId === existing.requesterCompanyId;
          if (!isParty && user.role !== "admin") {
            return res.status(403).json({ message: "Not authorized to cancel this listing" });
          }
          resource = await storage.updateResourceSharingStatus(req.params.id, ["requested", "booked"], "cancelled");
          break;
        }
        default:
          return res.status(400).json({ message: "Invalid status" });
      }

      if (!resource) {
        return res.status(409).json({ message: "This listing is no longer in the expected state - it may have already been updated." });
      }
      res.json(resource);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // === CAPACITY MATCHING ROUTES (route-connected spare capacity / empty-return) ===
  // A company already driving a route (or about to) publishes leftover volume/weight/
  // pallet space on that specific leg; customers with compatible cargo search and request
  // it. Deterministic text + capacity matching now - MoveX AI Core can rank results later,
  // but the matching itself must work correctly without it.
  app.post("/api/capacity-postings", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      if (!user.companyId) {
        return res.status(403).json({ message: "A company account is required to publish spare capacity" });
      }
      const { companyId: _companyId, ...rest } = req.body;
      const postingData = insertCapacityPostingSchema.parse({ ...rest, companyId: user.companyId });
      if (postingData.departureWindowEnd < postingData.departureWindowStart) {
        return res.status(400).json({ message: "departureWindowEnd must be after departureWindowStart" });
      }
      const posting = await storage.createCapacityPosting(postingData);
      res.status(201).json(posting);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/capacity-postings", async (req, res) => {
    const { from, to, date, minVolumeM3, minWeightKg, minPalletSpaces } = req.query;
    const postings = await storage.matchCapacityPostings({
      from: from ? String(from) : undefined,
      to: to ? String(to) : undefined,
      date: date ? new Date(String(date)) : undefined,
      minVolumeM3: minVolumeM3 ? Number(minVolumeM3) : undefined,
      minWeightKg: minWeightKg ? Number(minWeightKg) : undefined,
      minPalletSpaces: minPalletSpaces ? Number(minPalletSpaces) : undefined,
    });
    res.json(postings);
  });

  app.get("/api/companies/:companyId/capacity-postings", requireAuth, async (req, res) => {
    const postings = await storage.getCompanyCapacityPostings(req.params.companyId);
    res.json(postings);
  });

  app.patch("/api/capacity-postings/:id/cancel", requireAuth, async (req, res) => {
    const user = req.user as User;
    if (!user.companyId) {
      return res.status(403).json({ message: "Company access required" });
    }
    const posting = await storage.cancelCapacityPosting(req.params.id, user.companyId);
    if (!posting) {
      return res.status(404).json({ message: "Posting not found, already cancelled, or not owned by your company" });
    }
    res.json(posting);
  });

  app.post("/api/capacity-postings/:id/requests", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const posting = await storage.getCapacityPosting(req.params.id);
      if (!posting || posting.status !== "open") {
        return res.status(400).json({ message: "This capacity posting is not open for requests" });
      }
      const { postingId: _postingId, customerId: _customerId, ...rest } = req.body;
      const bookingData = insertCapacityBookingSchema.parse({ ...rest, postingId: posting.id, customerId: user.id });

      // Soft pre-check for a fast, clear error message; the real, race-safe enforcement
      // happens atomically in storage.acceptCapacityBooking at accept time.
      if (
        Number(bookingData.volumeM3) > Number(posting.freeVolumeM3) ||
        Number(bookingData.weightKg) > Number(posting.freeWeightKg) ||
        (bookingData.palletSpaces ?? 0) > posting.freePalletSpaces
      ) {
        return res.status(400).json({ message: "Requested capacity exceeds what's currently available on this posting" });
      }

      const priceEur = calculateCapacityBookingPrice(
        Number(bookingData.volumeM3),
        posting.pricePerM3Eur !== null ? Number(posting.pricePerM3Eur) : null,
        posting.minimumPriceEur !== null ? Number(posting.minimumPriceEur) : null,
      );
      const booking = await storage.createCapacityBooking(bookingData, String(priceEur));

      const companyUsers = await storage.getCompanyUsers(posting.companyId);
      await Promise.all(companyUsers.map((u) => storage.createNotification({
        userId: u.id,
        title: "New capacity request",
        message: `A customer requested ${bookingData.volumeM3} m³ on your ${posting.fromAddress} -> ${posting.toAddress} posting.`,
        type: "info",
        link: "/capacity",
      })));

      res.status(201).json(booking);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/capacity-postings/:id/requests", requireAuth, async (req, res) => {
    const user = req.user as User;
    const posting = await storage.getCapacityPosting(req.params.id);
    if (!posting) {
      return res.status(404).json({ message: "Posting not found" });
    }
    if (user.companyId !== posting.companyId && user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to view requests for this posting" });
    }
    res.json(await storage.getPostingCapacityBookings(req.params.id));
  });

  app.get("/api/users/:userId/capacity-bookings", requireAuth, async (req, res) => {
    const user = req.user as User;
    if (user.id !== req.params.userId && user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }
    res.json(await storage.getCustomerCapacityBookings(req.params.userId));
  });

  app.patch("/api/capacity-bookings/:id/accept", requireAuth, async (req, res) => {
    const user = req.user as User;
    const booking = await storage.getCapacityBooking(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Request not found" });
    }
    const posting = await storage.getCapacityPosting(booking.postingId);
    if (!posting || (user.companyId !== posting.companyId && user.role !== "admin")) {
      return res.status(403).json({ message: "Only the publishing company can accept this request" });
    }
    const result = await storage.acceptCapacityBooking(req.params.id);
    if (result.error) {
      return res.status(409).json({ message: result.error });
    }
    await storage.createNotification({
      userId: booking.customerId,
      title: "Capacity request accepted",
      message: `Your request for ${booking.volumeM3} m³ was accepted.`,
      type: "success",
      link: "/capacity",
    }).catch(() => undefined);
    res.json(result.booking);
  });

  app.patch("/api/capacity-bookings/:id/reject", requireAuth, async (req, res) => {
    const user = req.user as User;
    const booking = await storage.getCapacityBooking(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Request not found" });
    }
    const posting = await storage.getCapacityPosting(booking.postingId);
    if (!posting || (user.companyId !== posting.companyId && user.role !== "admin")) {
      return res.status(403).json({ message: "Only the publishing company can reject this request" });
    }
    const updated = await storage.updateCapacityBookingStatus(req.params.id, ["pending"], "rejected");
    if (!updated) {
      return res.status(409).json({ message: "This request is no longer pending" });
    }
    res.json(updated);
  });

  app.patch("/api/capacity-bookings/:id/cancel", requireAuth, async (req, res) => {
    const user = req.user as User;
    const booking = await storage.getCapacityBooking(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Request not found" });
    }
    if (user.id !== booking.customerId && user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to cancel this request" });
    }
    const updated = await storage.updateCapacityBookingStatus(req.params.id, ["pending", "accepted"], "cancelled");
    if (!updated) {
      return res.status(409).json({ message: "This request could not be cancelled" });
    }
    res.json(updated);
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
      const distanceInKm = route.distance / 1000;
      const durationInMinutes = Math.round(route.duration / 60);

      // CO2 uses the same shared, versioned methodology as booking creation and Road
      // Services - previously this endpoint kept its own separate, mile-based factor table.
      const normalizedVehicleType = normalizeVehicleType(vehicleType);
      const co2EmissionKg = calculateEmissionsKg(distanceInKm, normalizedVehicleType);

      res.json({
        distance: parseFloat(distanceInMiles),
        duration: durationInMinutes,
        co2Emission: co2EmissionKg,
        geometry: route.geometry,
        vehicleType: normalizedVehicleType,
        emissionFactor: EMISSION_FACTORS_KG_PER_KM[normalizedVehicleType],
      });
    } catch (error: any) {
      res.status(500).json({ message: "Route calculation failed: " + error.message });
    }
  });

  // Real GreenRoute: geocodes both addresses and asks Mapbox for alternative routes, then
  // picks the lowest-CO2 alternative using the same shared emission methodology as the rest
  // of the app. Never fabricates a "greener" route - if Mapbox has no alternative for this
  // pair, it honestly reports that the standard route is the only one available.
  app.post("/api/eco/optimize-route", async (req, res) => {
    try {
      if (!isMapboxConfigured()) {
        return res.status(503).json({ message: "Mapping is not configured", available: false });
      }
      const { origin, destination, vehicleType } = req.body;
      if (!origin || !destination) {
        return res.status(400).json({ message: "Origin and destination are required" });
      }

      const geocode = async (address: string) => {
        const response = await getGeocodingClient().forwardGeocode({ query: address, limit: 1 }).send();
        if (!response.body.features.length) return null;
        return response.body.features[0].geometry.coordinates as [number, number];
      };

      const [originCoords, destCoords] = await Promise.all([geocode(origin), geocode(destination)]);
      if (!originCoords) return res.status(404).json({ message: `Location not found: ${origin}` });
      if (!destCoords) return res.status(404).json({ message: `Location not found: ${destination}` });

      const directionsResponse = await getDirectionsClient()
        .getDirections({
          profile: "driving",
          waypoints: [
            { coordinates: originCoords },
            { coordinates: destCoords },
          ],
          geometries: "geojson",
          alternatives: true,
        })
        .send();

      if (!directionsResponse.body.routes.length) {
        return res.status(404).json({ message: "No route found between these locations", available: false });
      }

      const normalizedVehicleType = normalizeVehicleType(vehicleType);
      interface RouteCandidate { distanceKm: number; durationMin: number; co2Kg: number; geometry: unknown }
      const routes: RouteCandidate[] = directionsResponse.body.routes.map((route: any) => {
        const distanceKm = route.distance / 1000;
        return {
          distanceKm,
          durationMin: Math.round(route.duration / 60),
          co2Kg: calculateEmissionsKg(distanceKm, normalizedVehicleType),
          geometry: route.geometry,
        };
      });

      const standard = routes[0];
      const optimized = routes.reduce((best: RouteCandidate, r: RouteCandidate) => (r.co2Kg < best.co2Kg ? r : best), routes[0]);
      const hasGreenerAlternative = optimized.co2Kg < standard.co2Kg;

      // 1 litre of diesel combustion emits ~2.68 kg CO2 (standard published conversion factor)
      // - used only to translate a real CO2 delta into a real fuel-volume delta, not invented.
      const DIESEL_KG_CO2_PER_LITRE = 2.68;
      const co2SavedKg = Math.round((standard.co2Kg - optimized.co2Kg) * 100) / 100;

      res.json({
        available: true,
        alternativeRouteCount: routes.length,
        hasGreenerAlternative,
        vehicleType: normalizedVehicleType,
        standard: { distanceKm: Math.round(standard.distanceKm * 100) / 100, durationMin: standard.durationMin, co2Kg: standard.co2Kg, geometry: standard.geometry },
        optimized: { distanceKm: Math.round(optimized.distanceKm * 100) / 100, durationMin: optimized.durationMin, co2Kg: optimized.co2Kg, geometry: optimized.geometry },
        distanceSavedKm: Math.round((standard.distanceKm - optimized.distanceKm) * 100) / 100,
        timeSavedMin: standard.durationMin - optimized.durationMin,
        co2SavedKg,
        fuelSavedLiters: Math.round((co2SavedKg / DIESEL_KG_CO2_PER_LITRE) * 100) / 100,
        methodology: ECO_METHODOLOGY,
        methodologyVersion: ECO_METHODOLOGY_VERSION,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Route optimization failed: " + error.message });
    }
  });

  // === SKILLS ENGINE ===
  // Certifications/licenses reuse the existing /api/verification-documents endpoints
  // (holderType="user", docType=certification name) rather than a parallel upload system.
  app.get("/api/skills", async (_req, res) => {
    res.json(await storage.getAllSkills());
  });

  app.post("/api/skills", requireAdmin, async (req, res) => {
    try {
      const data = insertSkillSchema.parse(req.body);
      res.status(201).json(await storage.createSkill(data));
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/worker-profiles/me", requireAuth, async (req, res) => {
    const user = req.user as User;
    const profile = await storage.getWorkerProfileByUserId(user.id);
    if (!profile) return res.status(404).json({ message: "No worker profile yet" });
    res.json(profile);
  });

  app.get("/api/worker-profiles/:id", async (req, res) => {
    const profile = await storage.getWorkerProfile(req.params.id);
    if (!profile) return res.status(404).json({ message: "Worker profile not found" });
    res.json(profile);
  });

  app.post("/api/worker-profiles", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const existing = await storage.getWorkerProfileByUserId(user.id);
      if (existing) return res.status(409).json({ message: "You already have a worker profile" });
      // companyId always comes from the authenticated user's own affiliation, never trusted
      // from the request body, so a worker can't attach their profile to a company they
      // don't belong to.
      const data = insertWorkerProfileSchema.parse({ ...req.body, userId: user.id, companyId: user.companyId ?? null });
      res.status(201).json(await storage.createWorkerProfile(data));
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/worker-profiles/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const profile = await storage.getWorkerProfile(req.params.id);
      if (!profile) return res.status(404).json({ message: "Worker profile not found" });
      if (profile.userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ message: "Not authorized to edit this profile" });
      }
      const { companyId: _companyId, userId: _userId, ...rest } = req.body;
      const data = insertWorkerProfileSchema.partial().parse(rest);
      const updated = await storage.updateWorkerProfile(req.params.id, data);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/companies/:companyId/worker-profiles", async (req, res) => {
    res.json(await storage.getCompanyWorkerProfiles(req.params.companyId));
  });

  app.get("/api/worker-profiles/:id/skills", async (req, res) => {
    res.json(await storage.getProfileSkills(req.params.id));
  });

  app.post("/api/worker-profiles/:id/skills", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const profile = await storage.getWorkerProfile(req.params.id);
      if (!profile) return res.status(404).json({ message: "Worker profile not found" });
      if (profile.userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ message: "Not authorized to edit this profile's skills" });
      }
      const data = insertWorkerSkillSchema.parse({ ...req.body, profileId: req.params.id });
      res.status(201).json(await storage.setWorkerSkill(data));
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/worker-profiles/:id/skills/:skillId", requireAuth, async (req, res) => {
    const user = req.user as User;
    const profile = await storage.getWorkerProfile(req.params.id);
    if (!profile) return res.status(404).json({ message: "Worker profile not found" });
    if (profile.userId !== user.id && user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to edit this profile's skills" });
    }
    await storage.removeWorkerSkill(req.params.id, req.params.skillId);
    res.json({ message: "Skill removed" });
  });

  app.get("/api/skills/:skillId/candidates", async (req, res) => {
    res.json(await storage.findCandidatesForSkill(req.params.skillId));
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

  // On-demand re-check (e.g. an admin reviewing a flagged trip); the same check also runs
  // automatically on every new tracking update - see runGpsAnomalyCheck's call site below.
  app.post("/api/tracking/:bookingId/check-anomaly", requireAuth, async (req, res) => {
    const anomalyBooking = await storage.getBooking(req.params.bookingId);
    if (!anomalyBooking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (!(await userCanAccessBooking(req.user as User, anomalyBooking))) {
      return res.status(403).json({ message: "Not authorized to check this booking's tracking" });
    }
    res.json(await runGpsAnomalyCheck(req.params.bookingId, req.ip));
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
