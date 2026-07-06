import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { stripe } from "./stripe";
import { geocodingClient, directionsClient } from "./mapbox";
import { passport } from "./auth";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { 
  insertServiceSchema, insertBookingSchema, insertQuoteSchema, insertUserSchema,
  insertCompanySchema, insertDriverSchema, insertVehicleSchema, insertOfferSchema,
  insertMessageSchema, insertAttachmentSchema, insertReviewSchema,
  insertTrackingUpdateSchema, insertNotificationSchema, insertMarketplaceListingSchema,
  insertSharedRideSchema, insertRideBookingSchema, insertStaffSharingSchema,
  insertResourceSharingSchema, insertAnnouncementSchema, insertCouponSchema,
  offers, marketplaceListings, sharedRides, rideBookings, companies, bookings, drivers, vehicles,
  staffSharing, resourceSharing, announcements, users
} from "@shared/schema";
import type { User } from "@shared/schema";

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};

export async function registerRoutes(app: Express): Promise<Server> {
  // === AUTHENTICATION ROUTES ===
  app.post("/api/auth/register", async (req, res) => {
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

  app.post("/api/auth/login", (req, res, next) => {
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
  app.get("/api/users/phone/:phone", async (req, res) => {
    const user = await storage.getUserByPhone(req.params.phone);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  app.get("/api/users/:id", async (req, res) => {
    const user = await storage.getUser(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  app.post("/api/users", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      
      // Check if user with phone already exists
      const existing = await storage.getUserByPhone(userData.phone);
      if (existing) {
        // Verify password for existing user
        if (!userData.password || !existing.password) {
          return res.status(401).json({ message: "Invalid credentials" });
        }
        
        const passwordMatch = await bcrypt.compare(userData.password, existing.password);
        if (!passwordMatch) {
          return res.status(401).json({ message: "Invalid credentials" });
        }
        
        // Sanitize user object before login (remove password hash)
        const { password: _, ...sanitizedUser } = existing;
        
        // Auto-login existing user with valid password
        await new Promise<void>((resolve, reject) => {
          req.login(sanitizedUser as any, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        return res.json(sanitizedUser);
      }
      
      // Hash password before storing
      if (userData.password) {
        userData.password = await bcrypt.hash(userData.password, 10);
      }
      
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

  app.post("/api/companies", async (req, res) => {
    try {
      const companyData = insertCompanySchema.parse(req.body);
      const company = await storage.createCompany(companyData);
      res.status(201).json(company);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/companies/:id/verify", async (req, res) => {
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

  app.post("/api/drivers", async (req, res) => {
    try {
      const driverData = insertDriverSchema.parse(req.body);
      const driver = await storage.createDriver(driverData);
      res.status(201).json(driver);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/drivers/:id/availability", async (req, res) => {
    const { available } = req.body;
    if (typeof available !== 'boolean') {
      return res.status(400).json({ message: "Available must be a boolean" });
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

  app.post("/api/vehicles", async (req, res) => {
    try {
      const vehicleData = insertVehicleSchema.parse(req.body);
      const vehicle = await storage.createVehicle(vehicleData);
      res.status(201).json(vehicle);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
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
    const bookings = await storage.getAllBookings();
    res.json(bookings);
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
    res.json(booking);
  });

  app.get("/api/users/:userId/bookings", requireAuth, async (req, res) => {
    const bookings = await storage.getUserBookings(req.params.userId);
    res.json(bookings);
  });

  app.get("/api/companies/:companyId/bookings", requireAuth, async (req, res) => {
    const bookings = await storage.getCompanyBookings(req.params.companyId);
    res.json(bookings);
  });

  app.post("/api/bookings", requireAuth, async (req, res) => {
    try {
      const bookingData = insertBookingSchema.parse(req.body);
      const user = req.user as User;

      let finalPrice = bookingData.totalPrice;
      let discountAmount: string | undefined;

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
      }

      const booking = await storage.createBooking({
        ...bookingData,
        totalPrice: finalPrice,
        discountAmount,
      });

      if (bookingData.couponCode && discountAmount) {
        const coupon = await storage.getCouponByCode(bookingData.couponCode);
        if (coupon) {
          await storage.redeemCoupon(coupon.id, user.id, booking.id, discountAmount);
        }
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

    const booking = await storage.updateBookingStatus(req.params.id, status);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (status === "delivered") {
      // Capture the escrowed payment now that the delivery is confirmed
      if (booking.paymentIntentId && booking.paymentStatus === "authorized") {
        try {
          await stripe.paymentIntents.capture(booking.paymentIntentId);
          await storage.updateBookingPayment(booking.id, booking.paymentIntentId, "captured");
        } catch (error: any) {
          console.error("Failed to capture escrowed payment:", error.message);
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
        const existingRewards = await storage.getReferralRewards(bookingCustomer.id);
        const alreadyCredited = existingRewards.some((r) => r.referredUserId === bookingCustomer.id);
        if (!alreadyCredited) {
          const referrerResult = await db.select().from(users).where(eq(users.referralCode, bookingCustomer.referredByCode));
          const referrer = referrerResult[0];
          if (referrer) {
            await storage.createReferralReward({
              referrerUserId: referrer.id,
              referredUserId: bookingCustomer.id,
              bookingId: booking.id,
              amount: "25",
            });
          }
        }
      }
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

  app.patch("/api/bookings/:id/assign", requireAuth, async (req, res) => {
    const { companyId, driverId, vehicleId } = req.body;
    if (!companyId || !driverId || !vehicleId) {
      return res.status(400).json({ message: "Company ID, Driver ID, and Vehicle ID are required" });
    }
    
    const booking = await storage.assignCompanyToBooking(req.params.id, companyId, driverId, vehicleId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    res.json(booking);
  });

  app.patch("/api/bookings/:id/payment", requireAuth, async (req, res) => {
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
    const offers = await storage.getBookingOffers(req.params.bookingId);
    res.json(offers);
  });

  app.post("/api/offers", requireAuth, async (req, res) => {
    try {
      const offerData = insertOfferSchema.parse(req.body);
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
    const messages = await storage.getBookingMessages(req.params.bookingId);
    res.json(messages);
  });

  app.post("/api/messages", requireAuth, async (req, res) => {
    try {
      const messageData = insertMessageSchema.parse(req.body);
      const message = await storage.createMessage(messageData);
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
    const attachments = await storage.getBookingAttachments(req.params.bookingId);
    res.json(attachments);
  });

  app.post("/api/attachments", requireAuth, async (req, res) => {
    try {
      const attachmentData = insertAttachmentSchema.parse(req.body);
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
      const result = await db.insert(vehicles).values(vehicleData).returning();
      res.status(201).json(result[0]);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
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
      const { seatsBooked, totalPrice } = req.body;
      
      const ride = await db.select().from(sharedRides)
        .where(eq(sharedRides.id, req.params.id))
        .limit(1);
      
      if (!ride[0]) {
        return res.status(404).json({ message: "Ride not found" });
      }
      
      if (ride[0].availableSeats < seatsBooked) {
        return res.status(400).json({ message: "Not enough seats available" });
      }

      const booking = await db.insert(rideBookings).values({
        rideId: req.params.id,
        passengerId: user.id,
        seatsBooked,
        totalPrice,
      }).returning();

      await db.update(sharedRides)
        .set({ availableSeats: ride[0].availableSeats - seatsBooked })
        .where(eq(sharedRides.id, req.params.id));

      res.status(201).json(booking[0]);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // === TRACKING ROUTES ===
  app.get("/api/bookings/:bookingId/tracking", requireAuth, async (req, res) => {
    const tracking = await storage.getBookingTracking(req.params.bookingId);
    res.json(tracking);
  });

  app.post("/api/tracking", requireAuth, async (req, res) => {
    try {
      const trackingData = insertTrackingUpdateSchema.parse(req.body);
      const tracking = await storage.createTrackingUpdate(trackingData);
      res.status(201).json(tracking);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // === NOTIFICATION ROUTES ===
  app.get("/api/users/:userId/notifications", requireAuth, async (req, res) => {
    const notifications = await storage.getUserNotifications(req.params.userId);
    res.json(notifications);
  });

  app.post("/api/notifications", requireAuth, async (req, res) => {
    try {
      const notificationData = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification(notificationData);
      res.status(201).json(notification);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    const notification = await storage.markNotificationRead(req.params.id);
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

      const { providerCompanyId, ...rest } = req.body;
      const staffSharingData = insertStaffSharingSchema.parse({
        ...rest,
        providerCompanyId: user.companyId,
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
      const staffSharing = await storage.updateStaffSharingStatus(req.params.id, status);
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

      const { providerCompanyId, ...rest } = req.body;
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
      const resource = await storage.updateResourceSharingStatus(req.params.id, status);
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
      const { amount, bookingId } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Valid amount is required" });
      }

      const paymentIntent = await stripe.paymentIntents.create({
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
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }

      const plan = String(req.body.plan || "");
      const planConfig = PLAN_CONFIG[plan];
      if (!planConfig) {
        return res.status(400).json({ message: "Invalid plan. Choose basic, premium, or enterprise." });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "usd",
            product_data: { name: `Point to Point - ${plan} plan (monthly)` },
            unit_amount: planConfig.priceUsd * 100,
          },
        }],
        success_url: req.body.successUrl || "/console",
        cancel_url: req.body.cancelUrl || "/plans",
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
    const sig = req.headers["stripe-signature"];
    
    if (!sig) {
      return res.status(400).send("No signature");
    }

    try {
      const event = stripe.webhooks.constructEvent(
        req.body,
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

        case "payment_intent.succeeded":
          const paymentIntent = event.data.object;
          const bookingId = paymentIntent.metadata.bookingId;

          if (bookingId) {
            await storage.updateBookingPayment(
              bookingId,
              paymentIntent.id,
              "captured"
            );
          }
          break;

        case "payment_intent.payment_failed":
          const failedIntent = event.data.object;
          const failedBookingId = failedIntent.metadata.bookingId;
          
          if (failedBookingId) {
            await storage.updateBookingPayment(
              failedBookingId,
              failedIntent.id,
              "failed"
            );
          }
          break;
      }

      res.json({ received: true });
    } catch (err: any) {
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  });

  // === MAPBOX GEOCODING ROUTES ===
  app.post("/api/geocode", async (req, res) => {
    try {
      const { address } = req.body;
      
      if (!address) {
        return res.status(400).json({ message: "Address is required" });
      }

      const response = await geocodingClient
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
      const { pickupLng, pickupLat, deliveryLng, deliveryLat, vehicleType } = req.body;
      
      if (!pickupLng || !pickupLat || !deliveryLng || !deliveryLat) {
        return res.status(400).json({ message: "All coordinates are required" });
      }

      const response = await directionsClient
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

  // === DOWNLOAD CODE EXPORT ===
  app.get("/download-code", (req, res) => {
    const filePath = "/home/runner/workspace/code-export.txt";
    res.download(filePath, "point-to-point-code.txt", (err) => {
      if (err) {
        res.status(500).json({ message: "File download failed" });
      }
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
