import { 
  type User, type InsertUser,
  type Company, type InsertCompany,
  type Driver, type InsertDriver,
  type Vehicle, type InsertVehicle,
  type Service, type InsertService,
  type Booking, type InsertBooking,
  type Quote, type InsertQuote,
  type Offer, type InsertOffer,
  type Message, type InsertMessage,
  type Attachment, type InsertAttachment,
  type Review, type InsertReview,
  type TrackingUpdate, type InsertTrackingUpdate,
  type Notification, type InsertNotification,
  type MarketplaceListing, type InsertMarketplaceListing,
  type StaffSharing, type InsertStaffSharing,
  type ResourceSharing, type InsertResourceSharing,
  type Announcement, type InsertAnnouncement,
  type Badge, type InsertBadge, type BadgeAward, type InsertBadgeAward,
  type Coupon, type InsertCoupon, type CouponRedemption,
  type ReferralReward, type InsertReferralReward,
  type BookingTransfer, type InsertBookingTransfer,
  type DriverAvailability, type InsertDriverAvailability,
  type DriverTimeOff, type InsertDriverTimeOff,
  type CalendarConnection,
  type CargoItem, type InsertCargoItem,
  type MessageTranslation,
  type Call, type InsertCall,
  type VerificationDocument, type InsertVerificationDocument,
  type DeviceFingerprint,
  type RiskScore,
  type AuditLog,
  type ApiKey, type InsertApiKey,
  type WebhookSubscription, type InsertWebhookSubscription,
  type WebhookDelivery,
  users, companies, drivers, vehicles, services, bookings, quotes, offers,
  messages, attachments, reviews, trackingUpdates, notifications,
  marketplaceListings, staffSharing, resourceSharing, announcements,
  badges, badgeAwards, coupons, couponRedemptions, referralRewards, bookingTransfers,
  driverAvailability, driverTimeOff, calendarConnections, cargoItems, messageTranslations,
  calls, verificationDocuments, deviceFingerprints, riskScores, auditLogs,
  apiKeys, webhookSubscriptions, webhookDeliveries
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, or, gte, lte, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { encryptSecret, decryptSecret } from "./lib/crypto";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Company operations
  getAllCompanies(): Promise<Company[]>;
  getCompany(id: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  verifyCompany(id: string, verified: boolean): Promise<Company | undefined>;
  upgradeCompanyPlan(id: string, subscriptionTier: string, monthlyBookingLimit: number): Promise<Company | undefined>;
  
  // Driver operations
  getAllDrivers(): Promise<Driver[]>;
  getDriver(id: string): Promise<Driver | undefined>;
  getCompanyDrivers(companyId: string): Promise<Driver[]>;
  createDriver(driver: InsertDriver): Promise<Driver>;
  updateDriverAvailability(id: string, available: boolean): Promise<Driver | undefined>;
  
  // Vehicle operations
  getCompanyVehicles(companyId: string): Promise<Vehicle[]>;
  getVehicle(id: string): Promise<Vehicle | undefined>;
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  
  // Service operations
  getAllServices(): Promise<Service[]>;
  getService(id: string): Promise<Service | undefined>;
  createService(service: InsertService): Promise<Service>;
  
  // Booking operations
  getAllBookings(): Promise<Booking[]>;
  getBooking(id: string): Promise<Booking | undefined>;
  getUserBookings(userId: string): Promise<Booking[]>;
  getCompanyBookings(companyId: string): Promise<Booking[]>;
  getCompanyMonthlyBookingCount(companyId: string): Promise<number>;
  getPublicBookings(): Promise<Booking[]>;
  createBooking(booking: InsertBooking & { discountAmount?: string }): Promise<Booking>;
  updateBookingStatus(id: string, status: string): Promise<Booking | undefined>;
  cancelBooking(id: string): Promise<Booking | undefined>;
  assignCompanyToBooking(bookingId: string, companyId: string, driverId: string, vehicleId: string): Promise<Booking | undefined>;
  updateBookingPayment(bookingId: string, paymentIntentId: string, paymentStatus: string): Promise<Booking | undefined>;
  
  // Quote operations
  createQuote(quote: InsertQuote): Promise<Quote>;
  getQuote(id: string): Promise<Quote | undefined>;
  
  // Offer operations
  getBookingOffers(bookingId: string): Promise<Offer[]>;
  createOffer(offer: InsertOffer): Promise<Offer>;
  acceptOffer(offerId: string): Promise<Offer | undefined>;
  rejectOffer(offerId: string): Promise<Offer | undefined>;
  
  // Message operations
  getBookingMessages(bookingId: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  
  // Support chat operations
  getSupportMessages(bookingId: string): Promise<any[]>;
  createSupportMessage(data: any): Promise<any>;
  
  // Attachment operations
  getBookingAttachments(bookingId: string): Promise<Attachment[]>;
  createAttachment(attachment: InsertAttachment): Promise<Attachment>;
  
  // Review operations
  getCompanyReviews(companyId: string): Promise<Review[]>;
  createReview(review: InsertReview): Promise<Review>;
  
  // Tracking operations
  getBookingTracking(bookingId: string): Promise<TrackingUpdate[]>;
  createTrackingUpdate(update: InsertTrackingUpdate): Promise<TrackingUpdate>;
  
  // Notification operations
  getUserNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<Notification | undefined>;
  
  // Marketplace operations
  getAllMarketplaceListings(): Promise<MarketplaceListing[]>;
  getMarketplaceListing(id: string): Promise<MarketplaceListing | undefined>;
  createMarketplaceListing(listing: InsertMarketplaceListing): Promise<MarketplaceListing>;
  updateMarketplaceListing(id: string, available: boolean): Promise<MarketplaceListing | undefined>;
  
  // Staff sharing operations
  getAllStaffSharing(): Promise<StaffSharing[]>;
  getCompanyStaffSharing(companyId: string): Promise<StaffSharing[]>;
  createStaffSharing(staffSharing: InsertStaffSharing): Promise<StaffSharing>;
  updateStaffSharingStatus(id: string, status: string): Promise<StaffSharing | undefined>;
  
  // Resource sharing operations
  getAllResourceSharing(): Promise<ResourceSharing[]>;
  getAvailableResourceSharing(resourceType?: string): Promise<ResourceSharing[]>;
  createResourceSharing(resourceSharing: InsertResourceSharing): Promise<ResourceSharing>;
  updateResourceSharingStatus(id: string, status: string): Promise<ResourceSharing | undefined>;
  
  // Announcements operations
  getActiveAnnouncements(): Promise<Announcement[]>;
  getAnnouncement(id: string): Promise<Announcement | undefined>;
  createAnnouncement(announcement: InsertAnnouncement): Promise<Announcement>;
  incrementAnnouncementViews(id: string): Promise<Announcement | undefined>;
  incrementAnnouncementClicks(id: string): Promise<Announcement | undefined>;

  // Badge / gamification operations
  getAllBadges(): Promise<Badge[]>;
  getHolderBadges(holderType: string, holderId: string): Promise<(BadgeAward & { badge: Badge })[]>;
  awardBadgeIfMissing(holderType: string, holderId: string, badgeCode: string): Promise<BadgeAward | undefined>;
  checkAndAwardMilestoneBadges(holderType: "company" | "driver", holderId: string): Promise<void>;

  // Leaderboard operations
  getCompanyLeaderboard(limit?: number): Promise<Company[]>;
  getDriverLeaderboard(limit?: number): Promise<Driver[]>;

  // Coupon operations
  getCouponByCode(code: string): Promise<Coupon | undefined>;
  createCoupon(coupon: InsertCoupon): Promise<Coupon>;
  redeemCoupon(couponId: string, userId: string, bookingId: string | undefined, discountApplied: string): Promise<CouponRedemption>;

  // Referral operations
  getReferralRewards(userId: string): Promise<ReferralReward[]>;
  createReferralReward(reward: InsertReferralReward): Promise<ReferralReward>;

  // Booking transfer operations
  transferBooking(transfer: InsertBookingTransfer): Promise<BookingTransfer>;
  getBookingTransfers(bookingId: string): Promise<BookingTransfer[]>;

  // Driver availability calendar operations
  getDriverAvailability(driverId: string): Promise<DriverAvailability[]>;
  setDriverAvailability(driverId: string, slots: InsertDriverAvailability[]): Promise<DriverAvailability[]>;
  getDriverTimeOff(driverId: string): Promise<DriverTimeOff[]>;
  createDriverTimeOff(timeOff: InsertDriverTimeOff): Promise<DriverTimeOff>;
  deleteDriverTimeOff(id: string, driverId: string): Promise<boolean>;
  isDriverAvailableAt(driverId: string, when: Date): Promise<boolean>;
  findAvailableDrivers(companyId: string, when: Date): Promise<Driver[]>;

  // Calendar sync connections (Google/Outlook)
  getCalendarConnection(driverId: string, provider: string): Promise<CalendarConnection | undefined>;
  getDriverCalendarConnections(driverId: string): Promise<CalendarConnection[]>;
  upsertCalendarConnection(driverId: string, provider: string, accessToken: string, refreshToken: string | undefined, tokenExpiresAt: Date | undefined): Promise<CalendarConnection>;
  deleteCalendarConnection(driverId: string, provider: string): Promise<boolean>;
  decryptCalendarTokens(connection: CalendarConnection): { accessToken: string; refreshToken?: string };
  touchCalendarSync(id: string): Promise<void>;

  // AI cargo recognition operations
  getBookingCargoItems(bookingId: string): Promise<CargoItem[]>;
  createCargoItem(item: InsertCargoItem): Promise<CargoItem>;
  correctCargoItem(id: string, updates: Partial<InsertCargoItem>): Promise<CargoItem | undefined>;

  // AI chat translation operations
  getMessageTranslation(messageId: string, targetLanguage: string): Promise<MessageTranslation | undefined>;
  createMessageTranslation(messageId: string, sourceLanguage: string | undefined, targetLanguage: string, translatedContent: string, aiProvider: string): Promise<MessageTranslation>;

  // Voice/video call operations
  createCall(call: InsertCall): Promise<Call>;
  getCall(id: string): Promise<Call | undefined>;
  updateCallStatus(id: string, status: string, quality?: unknown): Promise<Call | undefined>;
  getUserCallHistory(userId: string): Promise<Call[]>;

  // Identity verification operations
  createVerificationDocument(doc: InsertVerificationDocument): Promise<VerificationDocument>;
  getHolderVerificationDocuments(holderType: string, holderId: string): Promise<VerificationDocument[]>;
  getPendingVerificationDocuments(): Promise<VerificationDocument[]>;
  reviewVerificationDocument(id: string, status: "approved" | "rejected", reviewedBy: string, rejectionReason?: string): Promise<VerificationDocument | undefined>;

  // Fraud prevention operations
  recordDeviceFingerprint(userId: string, fingerprintHash: string, userAgent: string | undefined, ipAddress: string | undefined): Promise<DeviceFingerprint>;
  findUsersBySharedFingerprint(fingerprintHash: string): Promise<DeviceFingerprint[]>;
  recordRiskScore(subjectType: string, subjectId: string, score: number, reasons: string[]): Promise<RiskScore>;
  getLatestRiskScore(subjectType: string, subjectId: string): Promise<RiskScore | undefined>;
  writeAuditLog(actorUserId: string | undefined, action: string, targetType: string | undefined, targetId: string | undefined, metadata: unknown, ipAddress: string | undefined): Promise<AuditLog>;
  getAuditLogs(targetType?: string, targetId?: string, limit?: number): Promise<AuditLog[]>;

  // Partner API operations
  createApiKey(key: InsertApiKey, keyHash: string, keyPrefix: string): Promise<ApiKey>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined>;
  getCompanyApiKeys(companyId: string): Promise<ApiKey[]>;
  revokeApiKey(id: string, companyId: string): Promise<boolean>;
  touchApiKeyUsage(id: string): Promise<void>;
  createWebhookSubscription(sub: InsertWebhookSubscription, secret: string): Promise<WebhookSubscription>;
  getCompanyWebhookSubscriptions(companyId: string): Promise<WebhookSubscription[]>;
  getActiveWebhookSubscriptionsForEvent(companyId: string, event: string): Promise<WebhookSubscription[]>;
  deleteWebhookSubscription(id: string, companyId: string): Promise<boolean>;
  recordWebhookDelivery(subscriptionId: string, event: string, payload: unknown, responseStatus: number | undefined, success: boolean, error?: string): Promise<WebhookDelivery>;
}

export class DbStorage implements IStorage {
  // === USER OPERATIONS ===
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.phone, phone));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!email) return undefined;
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  // === COMPANY OPERATIONS ===
  async getAllCompanies(): Promise<Company[]> {
    return await db.select().from(companies).limit(500);
  }

  async getCompany(id: string): Promise<Company | undefined> {
    const result = await db.select().from(companies).where(eq(companies.id, id));
    return result[0];
  }

  async createCompany(insertCompany: InsertCompany): Promise<Company> {
    const result = await db.insert(companies).values(insertCompany).returning();
    return result[0];
  }

  async verifyCompany(id: string, verified: boolean): Promise<Company | undefined> {
    const result = await db.update(companies)
      .set({ verified })
      .where(eq(companies.id, id))
      .returning();
    return result[0];
  }

  async upgradeCompanyPlan(id: string, subscriptionTier: string, monthlyBookingLimit: number): Promise<Company | undefined> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    const result = await db.update(companies)
      .set({ subscriptionTier, monthlyBookingLimit, subscriptionExpiresAt: expiresAt })
      .where(eq(companies.id, id))
      .returning();
    return result[0];
  }

  // === DRIVER OPERATIONS ===
  async getAllDrivers(): Promise<Driver[]> {
    return await db.select().from(drivers).limit(500);
  }

  async getDriver(id: string): Promise<Driver | undefined> {
    const result = await db.select().from(drivers).where(eq(drivers.id, id));
    return result[0];
  }

  async getCompanyDrivers(companyId: string): Promise<Driver[]> {
    return await db.select().from(drivers).where(eq(drivers.companyId, companyId));
  }

  async createDriver(insertDriver: InsertDriver): Promise<Driver> {
    const result = await db.insert(drivers).values(insertDriver).returning();
    return result[0];
  }

  async updateDriverAvailability(id: string, available: boolean): Promise<Driver | undefined> {
    const result = await db.update(drivers)
      .set({ available })
      .where(eq(drivers.id, id))
      .returning();
    return result[0];
  }

  // === VEHICLE OPERATIONS ===
  async getCompanyVehicles(companyId: string): Promise<Vehicle[]> {
    return await db.select().from(vehicles).where(eq(vehicles.companyId, companyId));
  }

  async getVehicle(id: string): Promise<Vehicle | undefined> {
    const result = await db.select().from(vehicles).where(eq(vehicles.id, id));
    return result[0];
  }

  async createVehicle(insertVehicle: InsertVehicle): Promise<Vehicle> {
    const result = await db.insert(vehicles).values(insertVehicle).returning();
    return result[0];
  }

  // === SERVICE OPERATIONS ===
  async getAllServices(): Promise<Service[]> {
    return await db.select().from(services);
  }

  async getService(id: string): Promise<Service | undefined> {
    const result = await db.select().from(services).where(eq(services.id, id));
    return result[0];
  }

  async createService(insertService: InsertService): Promise<Service> {
    const result = await db.insert(services).values(insertService).returning();
    return result[0];
  }

  // === BOOKING OPERATIONS ===
  async getAllBookings(): Promise<Booking[]> {
    return await db.select().from(bookings).orderBy(desc(bookings.createdAt)).limit(500);
  }

  async getBooking(id: string): Promise<Booking | undefined> {
    const result = await db.select().from(bookings).where(eq(bookings.id, id));
    return result[0];
  }

  async getUserBookings(userId: string): Promise<Booking[]> {
    return await db.select().from(bookings)
      .where(eq(bookings.userId, userId))
      .orderBy(desc(bookings.createdAt));
  }

  async getCompanyBookings(companyId: string): Promise<Booking[]> {
    return await db.select().from(bookings)
      .where(eq(bookings.companyId, companyId))
      .orderBy(desc(bookings.createdAt));
  }

  async getCompanyMonthlyBookingCount(companyId: string): Promise<number> {
    const result = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM bookings
      WHERE company_id = ${companyId}
      AND updated_at >= date_trunc('month', now())
      AND status NOT IN ('draft', 'posted', 'canceled')
    `);
    return Number((result.rows[0] as any)?.count ?? 0);
  }

  async getPublicBookings(): Promise<Booking[]> {
    return await db.select().from(bookings)
      .where(and(
        eq(bookings.isPublic, true),
        eq(bookings.status, "posted")
      ))
      .orderBy(desc(bookings.createdAt));
  }

  async createBooking(insertBooking: InsertBooking & { discountAmount?: string }): Promise<Booking> {
    const publicLink = randomUUID();
    const result = await db.insert(bookings).values({
      ...insertBooking,
      publicLink,
    }).returning();
    return result[0];
  }

  async updateBookingStatus(id: string, status: string): Promise<Booking | undefined> {
    const result = await db.update(bookings)
      .set({ status, updatedAt: new Date() })
      .where(eq(bookings.id, id))
      .returning();
    return result[0];
  }

  async assignCompanyToBooking(bookingId: string, companyId: string, driverId: string, vehicleId: string): Promise<Booking | undefined> {
    // Validate driver belongs to company
    const driver = await this.getDriver(driverId);
    if (!driver || driver.companyId !== companyId) {
      throw new Error("Driver not found or does not belong to this company");
    }

    // Validate vehicle belongs to company
    const vehicle = await this.getVehicle(vehicleId);
    if (!vehicle || vehicle.companyId !== companyId) {
      throw new Error("Vehicle not found or does not belong to this company");
    }

    const result = await db.update(bookings)
      .set({ companyId, driverId, vehicleId, status: "accepted", updatedAt: new Date() })
      .where(eq(bookings.id, bookingId))
      .returning();
    return result[0];
  }

  async updateBookingPayment(bookingId: string, paymentIntentId: string, paymentStatus: string): Promise<Booking | undefined> {
    const result = await db.update(bookings)
      .set({ paymentIntentId, paymentStatus, updatedAt: new Date() })
      .where(eq(bookings.id, bookingId))
      .returning();
    return result[0];
  }

  async cancelBooking(id: string): Promise<Booking | undefined> {
    const result = await db.update(bookings)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(bookings.id, id))
      .returning();
    return result[0];
  }

  // === QUOTE OPERATIONS ===
  async createQuote(insertQuote: InsertQuote): Promise<Quote> {
    const result = await db.insert(quotes).values(insertQuote).returning();
    return result[0];
  }

  async getQuote(id: string): Promise<Quote | undefined> {
    const result = await db.select().from(quotes).where(eq(quotes.id, id));
    return result[0];
  }

  // === OFFER OPERATIONS ===
  async getBookingOffers(bookingId: string): Promise<Offer[]> {
    return await db.select().from(offers)
      .where(eq(offers.bookingId, bookingId))
      .orderBy(desc(offers.createdAt));
  }

  async createOffer(insertOffer: InsertOffer): Promise<Offer> {
    const result = await db.insert(offers).values(insertOffer).returning();
    return result[0];
  }

  async acceptOffer(offerId: string): Promise<Offer | undefined> {
    return await db.transaction(async (tx) => {
      // Get the offer to be accepted
      const offerResult = await tx.select().from(offers).where(eq(offers.id, offerId));
      const offer = offerResult[0];

      if (!offer) {
        return undefined;
      }

      // Update the offer status to accepted
      const updatedOffer = await tx.update(offers)
        .set({ status: "accepted" })
        .where(eq(offers.id, offerId))
        .returning();

      // Reject all other offers for the same booking
      await tx.update(offers)
        .set({ status: "rejected" })
        .where(and(
          eq(offers.bookingId, offer.bookingId),
          sql`${offers.id} != ${offerId}`
        ));

      // Update the booking with the accepted offer details, in the same transaction so a
      // failed assignment (bad driver/vehicle) rolls back the offer status changes too.
      if (offer.companyId && offer.driverId && offer.vehicleId) {
        const driverResult = await tx.select().from(drivers).where(eq(drivers.id, offer.driverId));
        const driver = driverResult[0];
        if (!driver || driver.companyId !== offer.companyId) {
          throw new Error("Driver not found or does not belong to this company");
        }
        const vehicleResult = await tx.select().from(vehicles).where(eq(vehicles.id, offer.vehicleId));
        const vehicle = vehicleResult[0];
        if (!vehicle || vehicle.companyId !== offer.companyId) {
          throw new Error("Vehicle not found or does not belong to this company");
        }
        await tx.update(bookings)
          .set({
            companyId: offer.companyId,
            driverId: offer.driverId,
            vehicleId: offer.vehicleId,
            status: "accepted",
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, offer.bookingId));
      }

      return updatedOffer[0];
    });
  }

  async rejectOffer(offerId: string): Promise<Offer | undefined> {
    const result = await db.update(offers)
      .set({ status: "rejected" })
      .where(eq(offers.id, offerId))
      .returning();
    return result[0];
  }

  // === MESSAGE OPERATIONS ===
  async getBookingMessages(bookingId: string): Promise<Message[]> {
    return await db.select().from(messages)
      .where(eq(messages.bookingId, bookingId))
      .orderBy(messages.createdAt);
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const result = await db.insert(messages).values(insertMessage).returning();
    return result[0];
  }

  // === SUPPORT CHAT OPERATIONS ===
  async getSupportMessages(bookingId: string): Promise<any[]> {
    const supportMessages = await db.select().from(messages)
      .where(eq(messages.bookingId, bookingId))
      .orderBy(messages.createdAt);
    
    return supportMessages.map(msg => ({
      id: msg.id,
      bookingId: msg.bookingId,
      userId: msg.senderId,
      message: msg.content,
      sender: msg.senderId ? "customer" : "support",
      createdAt: msg.createdAt,
    }));
  }

  async createSupportMessage(data: any): Promise<any> {
    const messageData = {
      bookingId: data.bookingId,
      senderId: data.userId || null,
      content: data.message,
    };
    
    const result = await db.insert(messages).values(messageData).returning();
    const newMessage = result[0];
    
    return {
      id: newMessage.id,
      bookingId: newMessage.bookingId,
      userId: newMessage.senderId,
      message: newMessage.content,
      sender: data.sender,
      createdAt: newMessage.createdAt,
    };
  }

  // === ATTACHMENT OPERATIONS ===
  async getBookingAttachments(bookingId: string): Promise<Attachment[]> {
    return await db.select().from(attachments)
      .where(eq(attachments.bookingId, bookingId))
      .orderBy(desc(attachments.createdAt));
  }

  async createAttachment(insertAttachment: InsertAttachment): Promise<Attachment> {
    const result = await db.insert(attachments).values(insertAttachment).returning();
    return result[0];
  }

  // === REVIEW OPERATIONS ===
  async getCompanyReviews(companyId: string): Promise<Review[]> {
    return await db.select().from(reviews)
      .where(eq(reviews.companyId, companyId))
      .orderBy(desc(reviews.createdAt));
  }

  async createReview(insertReview: InsertReview): Promise<Review> {
    const result = await db.insert(reviews).values(insertReview).returning();
    
    // Update company rating
    if (insertReview.companyId) {
      const companyReviews = await this.getCompanyReviews(insertReview.companyId);
      const totalRating = companyReviews.reduce((sum, r) => sum + r.rating, 0);
      const avgRating = totalRating / companyReviews.length;
      
      await db.update(companies)
        .set({ 
          rating: avgRating.toFixed(2),
          totalReviews: companyReviews.length 
        })
        .where(eq(companies.id, insertReview.companyId));
    }
    
    return result[0];
  }

  // === TRACKING OPERATIONS ===
  async getBookingTracking(bookingId: string): Promise<TrackingUpdate[]> {
    return await db.select().from(trackingUpdates)
      .where(eq(trackingUpdates.bookingId, bookingId))
      .orderBy(trackingUpdates.createdAt);
  }

  async createTrackingUpdate(insertUpdate: InsertTrackingUpdate): Promise<TrackingUpdate> {
    const result = await db.insert(trackingUpdates).values(insertUpdate).returning();
    return result[0];
  }

  // === NOTIFICATION OPERATIONS ===
  async getUserNotifications(userId: string): Promise<Notification[]> {
    return await db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const result = await db.insert(notifications).values(insertNotification).returning();
    return result[0];
  }

  async markNotificationRead(id: string): Promise<Notification | undefined> {
    const result = await db.update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, id))
      .returning();
    return result[0];
  }

  // === MARKETPLACE OPERATIONS ===
  async getAllMarketplaceListings(): Promise<MarketplaceListing[]> {
    return await db.select().from(marketplaceListings)
      .where(eq(marketplaceListings.available, true))
      .orderBy(desc(marketplaceListings.createdAt));
  }

  async getMarketplaceListing(id: string): Promise<MarketplaceListing | undefined> {
    const result = await db.select().from(marketplaceListings)
      .where(eq(marketplaceListings.id, id));
    return result[0];
  }

  async createMarketplaceListing(insertListing: InsertMarketplaceListing): Promise<MarketplaceListing> {
    const result = await db.insert(marketplaceListings).values(insertListing).returning();
    return result[0];
  }

  async updateMarketplaceListing(id: string, available: boolean): Promise<MarketplaceListing | undefined> {
    const result = await db.update(marketplaceListings)
      .set({ available })
      .where(eq(marketplaceListings.id, id))
      .returning();
    return result[0];
  }

  // === STAFF SHARING OPERATIONS ===
  async getAllStaffSharing(): Promise<StaffSharing[]> {
    return await db.select().from(staffSharing)
      .orderBy(desc(staffSharing.createdAt));
  }

  async getCompanyStaffSharing(companyId: string): Promise<StaffSharing[]> {
    return await db.select().from(staffSharing)
      .where(
        sql`${staffSharing.lenderCompanyId} = ${companyId} OR ${staffSharing.borrowerCompanyId} = ${companyId}`
      )
      .orderBy(desc(staffSharing.createdAt));
  }

  async createStaffSharing(insertStaffSharing: InsertStaffSharing): Promise<StaffSharing> {
    const result = await db.insert(staffSharing).values(insertStaffSharing).returning();
    return result[0];
  }

  async updateStaffSharingStatus(id: string, status: string): Promise<StaffSharing | undefined> {
    const result = await db.update(staffSharing)
      .set({ status })
      .where(eq(staffSharing.id, id))
      .returning();
    return result[0];
  }

  // === RESOURCE SHARING OPERATIONS ===
  async getAllResourceSharing(): Promise<ResourceSharing[]> {
    return await db.select().from(resourceSharing)
      .orderBy(desc(resourceSharing.createdAt));
  }

  async getAvailableResourceSharing(resourceType?: string): Promise<ResourceSharing[]> {
    if (resourceType) {
      return await db.select().from(resourceSharing)
        .where(and(
          eq(resourceSharing.available, true),
          eq(resourceSharing.resourceType, resourceType)
        ))
        .orderBy(desc(resourceSharing.createdAt));
    }
    return await db.select().from(resourceSharing)
      .where(eq(resourceSharing.available, true))
      .orderBy(desc(resourceSharing.createdAt));
  }

  async createResourceSharing(insertResourceSharing: InsertResourceSharing): Promise<ResourceSharing> {
    const result = await db.insert(resourceSharing).values(insertResourceSharing).returning();
    return result[0];
  }

  async updateResourceSharingStatus(id: string, status: string): Promise<ResourceSharing | undefined> {
    const result = await db.update(resourceSharing)
      .set({ status })
      .where(eq(resourceSharing.id, id))
      .returning();
    return result[0];
  }

  // === ANNOUNCEMENTS OPERATIONS ===
  async getActiveAnnouncements(): Promise<Announcement[]> {
    const now = new Date();
    return await db.select().from(announcements)
      .where(and(
        eq(announcements.active, true),
        sql`${announcements.startDate} <= ${now}`,
        sql`${announcements.endDate} >= ${now}`
      ))
      .orderBy(desc(announcements.createdAt));
  }

  async getAnnouncement(id: string): Promise<Announcement | undefined> {
    const result = await db.select().from(announcements)
      .where(eq(announcements.id, id));
    return result[0];
  }

  async createAnnouncement(insertAnnouncement: InsertAnnouncement): Promise<Announcement> {
    const result = await db.insert(announcements).values(insertAnnouncement).returning();
    return result[0];
  }

  async incrementAnnouncementViews(id: string): Promise<Announcement | undefined> {
    const result = await db.update(announcements)
      .set({ views: sql`${announcements.views} + 1` })
      .where(eq(announcements.id, id))
      .returning();
    return result[0];
  }

  async incrementAnnouncementClicks(id: string): Promise<Announcement | undefined> {
    const result = await db.update(announcements)
      .set({ clicks: sql`${announcements.clicks} + 1` })
      .where(eq(announcements.id, id))
      .returning();
    return result[0];
  }

  // === BADGE / GAMIFICATION OPERATIONS ===
  async getAllBadges(): Promise<Badge[]> {
    return await db.select().from(badges);
  }

  async getHolderBadges(holderType: string, holderId: string): Promise<(BadgeAward & { badge: Badge })[]> {
    const rows = await db.select({ award: badgeAwards, badge: badges })
      .from(badgeAwards)
      .innerJoin(badges, eq(badgeAwards.badgeId, badges.id))
      .where(and(eq(badgeAwards.holderType, holderType), eq(badgeAwards.holderId, holderId)))
      .orderBy(desc(badgeAwards.awardedAt));
    return rows.map((r) => ({ ...r.award, badge: r.badge }));
  }

  async awardBadgeIfMissing(holderType: string, holderId: string, badgeCode: string): Promise<BadgeAward | undefined> {
    const badgeResult = await db.select().from(badges).where(eq(badges.code, badgeCode));
    const badge = badgeResult[0];
    if (!badge) return undefined;

    const existing = await db.select().from(badgeAwards).where(and(
      eq(badgeAwards.holderType, holderType),
      eq(badgeAwards.holderId, holderId),
      eq(badgeAwards.badgeId, badge.id),
    ));
    if (existing.length > 0) return existing[0];

    const result = await db.insert(badgeAwards).values({ holderType, holderId, badgeId: badge.id }).returning();
    return result[0];
  }

  async checkAndAwardMilestoneBadges(holderType: "company" | "driver", holderId: string): Promise<void> {
    const column = holderType === "company" ? bookings.companyId : bookings.driverId;
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM bookings
      WHERE ${column} = ${holderId} AND status = 'delivered'
    `);
    const completed = Number((countResult.rows[0] as any)?.count ?? 0);

    if (completed >= 100) await this.awardBadgeIfMissing(holderType, holderId, "completed_100");
    if (completed >= 500) await this.awardBadgeIfMissing(holderType, holderId, "completed_500");
    if (completed >= 1000) await this.awardBadgeIfMissing(holderType, holderId, "completed_1000");

    if (holderType === "company") {
      const company = await this.getCompany(holderId);
      if (company && Number(company.rating) >= 4.8 && (company.totalReviews ?? 0) >= 20) {
        await this.awardBadgeIfMissing("company", holderId, "super_carrier");
      }
    }
  }

  // === LEADERBOARD OPERATIONS ===
  async getCompanyLeaderboard(limit = 20): Promise<Company[]> {
    return await db.select().from(companies)
      .where(eq(companies.verified, true))
      .orderBy(desc(companies.rating), desc(companies.totalReviews))
      .limit(limit);
  }

  async getDriverLeaderboard(limit = 20): Promise<Driver[]> {
    return await db.select().from(drivers)
      .orderBy(desc(drivers.rating), desc(drivers.totalDeliveries))
      .limit(limit);
  }

  // === COUPON OPERATIONS ===
  async getCouponByCode(code: string): Promise<Coupon | undefined> {
    const result = await db.select().from(coupons).where(eq(coupons.code, code.toUpperCase()));
    return result[0];
  }

  async createCoupon(insertCoupon: InsertCoupon): Promise<Coupon> {
    const result = await db.insert(coupons).values({ ...insertCoupon, code: insertCoupon.code.toUpperCase() }).returning();
    return result[0];
  }

  async redeemCoupon(couponId: string, userId: string, bookingId: string | undefined, discountApplied: string): Promise<CouponRedemption> {
    const result = await db.insert(couponRedemptions).values({ couponId, userId, bookingId, discountApplied }).returning();
    await db.update(coupons)
      .set({ timesRedeemed: sql`${coupons.timesRedeemed} + 1` })
      .where(eq(coupons.id, couponId));
    return result[0];
  }

  // === REFERRAL OPERATIONS ===
  async getReferralRewards(userId: string): Promise<ReferralReward[]> {
    return await db.select().from(referralRewards)
      .where(eq(referralRewards.referrerUserId, userId))
      .orderBy(desc(referralRewards.createdAt));
  }

  async createReferralReward(reward: InsertReferralReward): Promise<ReferralReward> {
    const result = await db.insert(referralRewards).values(reward).returning();
    return result[0];
  }

  // === BOOKING TRANSFER OPERATIONS ===
  async transferBooking(transfer: InsertBookingTransfer): Promise<BookingTransfer> {
    const result = await db.insert(bookingTransfers).values(transfer).returning();
    await db.update(bookings)
      .set({ companyId: transfer.toCompanyId, driverId: null, vehicleId: null, updatedAt: new Date() })
      .where(eq(bookings.id, transfer.bookingId));
    return result[0];
  }

  async getBookingTransfers(bookingId: string): Promise<BookingTransfer[]> {
    return await db.select().from(bookingTransfers)
      .where(eq(bookingTransfers.bookingId, bookingId))
      .orderBy(desc(bookingTransfers.createdAt));
  }

  // === DRIVER AVAILABILITY CALENDAR ===
  async getDriverAvailability(driverId: string): Promise<DriverAvailability[]> {
    return await db.select().from(driverAvailability)
      .where(eq(driverAvailability.driverId, driverId))
      .orderBy(driverAvailability.dayOfWeek);
  }

  async setDriverAvailability(driverId: string, slots: InsertDriverAvailability[]): Promise<DriverAvailability[]> {
    await db.delete(driverAvailability).where(eq(driverAvailability.driverId, driverId));
    if (slots.length === 0) return [];
    const result = await db.insert(driverAvailability)
      .values(slots.map((s) => ({ ...s, driverId })))
      .returning();
    return result;
  }

  async getDriverTimeOff(driverId: string): Promise<DriverTimeOff[]> {
    return await db.select().from(driverTimeOff)
      .where(eq(driverTimeOff.driverId, driverId))
      .orderBy(desc(driverTimeOff.startDate));
  }

  async createDriverTimeOff(timeOff: InsertDriverTimeOff): Promise<DriverTimeOff> {
    const result = await db.insert(driverTimeOff).values(timeOff).returning();
    return result[0];
  }

  async deleteDriverTimeOff(id: string, driverId: string): Promise<boolean> {
    const result = await db.delete(driverTimeOff)
      .where(and(eq(driverTimeOff.id, id), eq(driverTimeOff.driverId, driverId)))
      .returning();
    return result.length > 0;
  }

  async isDriverAvailableAt(driverId: string, when: Date): Promise<boolean> {
    const timeOffRows = await db.select().from(driverTimeOff)
      .where(and(
        eq(driverTimeOff.driverId, driverId),
        lte(driverTimeOff.startDate, when),
        gte(driverTimeOff.endDate, when),
      ));
    if (timeOffRows.length > 0) return false;

    const dayOfWeek = when.getDay();
    const hhmm = `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
    const slots = await db.select().from(driverAvailability)
      .where(and(
        eq(driverAvailability.driverId, driverId),
        eq(driverAvailability.dayOfWeek, dayOfWeek),
        eq(driverAvailability.active, true),
      ));

    if (slots.length === 0) return true; // no configured schedule = assume available
    return slots.some((s) => hhmm >= s.startTime && hhmm <= s.endTime);
  }

  async findAvailableDrivers(companyId: string, when: Date): Promise<Driver[]> {
    const companyDrivers = await db.select().from(drivers)
      .where(and(eq(drivers.companyId, companyId), eq(drivers.available, true)));
    if (companyDrivers.length === 0) return [];

    const driverIds = companyDrivers.map((d) => d.id);
    const dayOfWeek = when.getDay();
    const hhmm = `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;

    const [timeOffRows, availabilityRows] = await Promise.all([
      db.select().from(driverTimeOff).where(and(
        inArray(driverTimeOff.driverId, driverIds),
        lte(driverTimeOff.startDate, when),
        gte(driverTimeOff.endDate, when),
      )),
      db.select().from(driverAvailability).where(and(
        inArray(driverAvailability.driverId, driverIds),
        eq(driverAvailability.dayOfWeek, dayOfWeek),
        eq(driverAvailability.active, true),
      )),
    ]);

    const onTimeOff = new Set(timeOffRows.map((r) => r.driverId));
    const slotsByDriver = new Map<string, typeof availabilityRows>();
    for (const slot of availabilityRows) {
      if (!slotsByDriver.has(slot.driverId)) slotsByDriver.set(slot.driverId, []);
      slotsByDriver.get(slot.driverId)!.push(slot);
    }

    return companyDrivers.filter((driver) => {
      if (onTimeOff.has(driver.id)) return false;
      const slots = slotsByDriver.get(driver.id);
      if (!slots || slots.length === 0) return true; // no configured schedule = assume available
      return slots.some((s) => hhmm >= s.startTime && hhmm <= s.endTime);
    });
  }

  // === CALENDAR SYNC CONNECTIONS ===
  async getCalendarConnection(driverId: string, provider: string): Promise<CalendarConnection | undefined> {
    const result = await db.select().from(calendarConnections)
      .where(and(eq(calendarConnections.driverId, driverId), eq(calendarConnections.provider, provider)));
    return result[0];
  }

  async getDriverCalendarConnections(driverId: string): Promise<CalendarConnection[]> {
    return await db.select().from(calendarConnections).where(eq(calendarConnections.driverId, driverId));
  }

  async upsertCalendarConnection(
    driverId: string,
    provider: string,
    accessToken: string,
    refreshToken: string | undefined,
    tokenExpiresAt: Date | undefined,
  ): Promise<CalendarConnection> {
    const existing = await this.getCalendarConnection(driverId, provider);
    const accessTokenEncrypted = encryptSecret(accessToken);
    const refreshTokenEncrypted = refreshToken ? encryptSecret(refreshToken) : undefined;

    if (existing) {
      const result = await db.update(calendarConnections)
        .set({ accessTokenEncrypted, refreshTokenEncrypted, tokenExpiresAt, syncEnabled: true })
        .where(eq(calendarConnections.id, existing.id))
        .returning();
      return result[0];
    }

    const result = await db.insert(calendarConnections)
      .values({ driverId, provider, accessTokenEncrypted, refreshTokenEncrypted, tokenExpiresAt })
      .returning();
    return result[0];
  }

  async deleteCalendarConnection(driverId: string, provider: string): Promise<boolean> {
    const result = await db.delete(calendarConnections)
      .where(and(eq(calendarConnections.driverId, driverId), eq(calendarConnections.provider, provider)))
      .returning();
    return result.length > 0;
  }

  decryptCalendarTokens(connection: CalendarConnection): { accessToken: string; refreshToken?: string } {
    return {
      accessToken: decryptSecret(connection.accessTokenEncrypted),
      refreshToken: connection.refreshTokenEncrypted ? decryptSecret(connection.refreshTokenEncrypted) : undefined,
    };
  }

  async touchCalendarSync(id: string): Promise<void> {
    await db.update(calendarConnections).set({ lastSyncedAt: new Date() }).where(eq(calendarConnections.id, id));
  }

  // === AI CARGO RECOGNITION ===
  async getBookingCargoItems(bookingId: string): Promise<CargoItem[]> {
    return await db.select().from(cargoItems)
      .where(eq(cargoItems.bookingId, bookingId))
      .orderBy(desc(cargoItems.createdAt));
  }

  async createCargoItem(item: InsertCargoItem): Promise<CargoItem> {
    const result = await db.insert(cargoItems).values(item).returning();
    return result[0];
  }

  async correctCargoItem(id: string, updates: Partial<InsertCargoItem>): Promise<CargoItem | undefined> {
    const result = await db.update(cargoItems)
      .set({ ...updates, manuallyCorrected: true })
      .where(eq(cargoItems.id, id))
      .returning();
    return result[0];
  }

  // === AI CHAT TRANSLATION ===
  async getMessageTranslation(messageId: string, targetLanguage: string): Promise<MessageTranslation | undefined> {
    const result = await db.select().from(messageTranslations)
      .where(and(eq(messageTranslations.messageId, messageId), eq(messageTranslations.targetLanguage, targetLanguage)));
    return result[0];
  }

  async createMessageTranslation(
    messageId: string,
    sourceLanguage: string | undefined,
    targetLanguage: string,
    translatedContent: string,
    aiProvider: string,
  ): Promise<MessageTranslation> {
    const result = await db.insert(messageTranslations)
      .values({ messageId, sourceLanguage, targetLanguage, translatedContent, aiProvider })
      .returning();
    return result[0];
  }

  // === VOICE / VIDEO CALLS ===
  async createCall(call: InsertCall): Promise<Call> {
    const result = await db.insert(calls).values(call).returning();
    return result[0];
  }

  async getCall(id: string): Promise<Call | undefined> {
    const result = await db.select().from(calls).where(eq(calls.id, id));
    return result[0];
  }

  async updateCallStatus(id: string, status: string, quality?: unknown): Promise<Call | undefined> {
    const updates: Record<string, unknown> = { status };
    if (status === "accepted") updates.connectedAt = new Date();
    if (status === "completed" || status === "rejected" || status === "missed" || status === "failed") {
      updates.endedAt = new Date();
      const call = await this.getCall(id);
      if (call?.connectedAt) {
        updates.durationSeconds = Math.max(0, Math.round((Date.now() - new Date(call.connectedAt).getTime()) / 1000));
      }
    }
    if (quality) updates.quality = quality;

    const result = await db.update(calls).set(updates).where(eq(calls.id, id)).returning();
    return result[0];
  }

  async getUserCallHistory(userId: string): Promise<Call[]> {
    return await db.select().from(calls)
      .where(or(eq(calls.callerId, userId), eq(calls.calleeId, userId)))
      .orderBy(desc(calls.createdAt));
  }

  // === IDENTITY VERIFICATION ===
  async createVerificationDocument(doc: InsertVerificationDocument): Promise<VerificationDocument> {
    const result = await db.insert(verificationDocuments).values(doc).returning();
    return result[0];
  }

  async getHolderVerificationDocuments(holderType: string, holderId: string): Promise<VerificationDocument[]> {
    return await db.select().from(verificationDocuments)
      .where(and(eq(verificationDocuments.holderType, holderType), eq(verificationDocuments.holderId, holderId)))
      .orderBy(desc(verificationDocuments.submittedAt));
  }

  async getPendingVerificationDocuments(): Promise<VerificationDocument[]> {
    return await db.select().from(verificationDocuments)
      .where(eq(verificationDocuments.status, "pending"))
      .orderBy(verificationDocuments.submittedAt);
  }

  async reviewVerificationDocument(
    id: string,
    status: "approved" | "rejected",
    reviewedBy: string,
    rejectionReason?: string,
  ): Promise<VerificationDocument | undefined> {
    const result = await db.update(verificationDocuments)
      .set({ status, reviewedBy, reviewedAt: new Date(), rejectionReason })
      .where(eq(verificationDocuments.id, id))
      .returning();
    return result[0];
  }

  // === FRAUD PREVENTION ===
  async recordDeviceFingerprint(
    userId: string,
    fingerprintHash: string,
    userAgent: string | undefined,
    ipAddress: string | undefined,
  ): Promise<DeviceFingerprint> {
    const existing = await db.select().from(deviceFingerprints)
      .where(and(eq(deviceFingerprints.userId, userId), eq(deviceFingerprints.fingerprintHash, fingerprintHash)));
    if (existing.length > 0) {
      const result = await db.update(deviceFingerprints)
        .set({ lastSeenAt: new Date(), userAgent, ipAddress })
        .where(eq(deviceFingerprints.id, existing[0].id))
        .returning();
      return result[0];
    }
    const result = await db.insert(deviceFingerprints)
      .values({ userId, fingerprintHash, userAgent, ipAddress })
      .returning();
    return result[0];
  }

  async findUsersBySharedFingerprint(fingerprintHash: string): Promise<DeviceFingerprint[]> {
    return await db.select().from(deviceFingerprints).where(eq(deviceFingerprints.fingerprintHash, fingerprintHash));
  }

  async recordRiskScore(subjectType: string, subjectId: string, score: number, reasons: string[]): Promise<RiskScore> {
    const result = await db.insert(riskScores).values({ subjectType, subjectId, score, reasons }).returning();
    return result[0];
  }

  async getLatestRiskScore(subjectType: string, subjectId: string): Promise<RiskScore | undefined> {
    const result = await db.select().from(riskScores)
      .where(and(eq(riskScores.subjectType, subjectType), eq(riskScores.subjectId, subjectId)))
      .orderBy(desc(riskScores.createdAt))
      .limit(1);
    return result[0];
  }

  async writeAuditLog(
    actorUserId: string | undefined,
    action: string,
    targetType: string | undefined,
    targetId: string | undefined,
    metadata: unknown,
    ipAddress: string | undefined,
  ): Promise<AuditLog> {
    const result = await db.insert(auditLogs)
      .values({ actorUserId, action, targetType, targetId, metadata, ipAddress })
      .returning();
    return result[0];
  }

  async getAuditLogs(targetType?: string, targetId?: string, limit = 100): Promise<AuditLog[]> {
    const conditions = [];
    if (targetType) conditions.push(eq(auditLogs.targetType, targetType));
    if (targetId) conditions.push(eq(auditLogs.targetId, targetId));

    const query = db.select().from(auditLogs);
    if (conditions.length > 0) {
      return await query.where(and(...conditions)).orderBy(desc(auditLogs.createdAt)).limit(limit);
    }
    return await query.orderBy(desc(auditLogs.createdAt)).limit(limit);
  }

  // === PUBLIC PARTNER API ===
  async createApiKey(key: InsertApiKey, keyHash: string, keyPrefix: string): Promise<ApiKey> {
    const result = await db.insert(apiKeys).values({ ...key, keyHash, keyPrefix }).returning();
    return result[0];
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
    const result = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.active, true)));
    return result[0];
  }

  async getCompanyApiKeys(companyId: string): Promise<ApiKey[]> {
    return await db.select().from(apiKeys)
      .where(eq(apiKeys.companyId, companyId))
      .orderBy(desc(apiKeys.createdAt));
  }

  async revokeApiKey(id: string, companyId: string): Promise<boolean> {
    const result = await db.update(apiKeys)
      .set({ active: false, revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.companyId, companyId)))
      .returning();
    return result.length > 0;
  }

  async touchApiKeyUsage(id: string): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }

  async createWebhookSubscription(sub: InsertWebhookSubscription, secret: string): Promise<WebhookSubscription> {
    const result = await db.insert(webhookSubscriptions).values({ ...sub, secret }).returning();
    return result[0];
  }

  async getCompanyWebhookSubscriptions(companyId: string): Promise<WebhookSubscription[]> {
    return await db.select().from(webhookSubscriptions).where(eq(webhookSubscriptions.companyId, companyId));
  }

  async getActiveWebhookSubscriptionsForEvent(companyId: string, event: string): Promise<WebhookSubscription[]> {
    const subs = await db.select().from(webhookSubscriptions)
      .where(and(eq(webhookSubscriptions.companyId, companyId), eq(webhookSubscriptions.active, true)));
    return subs.filter((s) => s.events.includes(event));
  }

  async deleteWebhookSubscription(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(webhookSubscriptions)
      .where(and(eq(webhookSubscriptions.id, id), eq(webhookSubscriptions.companyId, companyId)))
      .returning();
    return result.length > 0;
  }

  async recordWebhookDelivery(
    subscriptionId: string,
    event: string,
    payload: unknown,
    responseStatus: number | undefined,
    success: boolean,
    error?: string,
  ): Promise<WebhookDelivery> {
    const result = await db.insert(webhookDeliveries)
      .values({ subscriptionId, event, payload, responseStatus, success, error })
      .returning();
    return result[0];
  }
}

// Seed initial services
async function seedServices(storage: DbStorage) {
  const existingServices = await storage.getAllServices();
  if (existingServices.length === 0) {
    const defaultServices = [
      {
        name: "Residential Moving",
        description: "Complete home moving service with professional movers",
        basePrice: "150.00",
        pricePerMile: "2.50",
        icon: "home"
      },
      {
        name: "Commercial Transport",
        description: "Office and business relocation services",
        basePrice: "250.00",
        pricePerMile: "3.00",
        icon: "building"
      },
      {
        name: "Long Distance",
        description: "Interstate and long-haul moving services",
        basePrice: "500.00",
        pricePerMile: "1.50",
        icon: "truck"
      },
      {
        name: "Packing Services",
        description: "Professional packing and unpacking assistance",
        basePrice: "100.00",
        pricePerMile: "1.00",
        icon: "package"
      }
    ];

    for (const service of defaultServices) {
      await storage.createService(service);
    }
  }
}

async function seedBadges(storage: DbStorage) {
  const existingBadges = await storage.getAllBadges();
  if (existingBadges.length === 0) {
    const defaultBadges = [
      { code: "super_carrier", name: "Super Przewoźnik", description: "Rating 4.8+ with at least 20 reviews", icon: "shield-check" },
      { code: "premium", name: "Premium", description: "Active Premium plan subscriber", icon: "star" },
      { code: "elite", name: "Elite", description: "Active Enterprise plan subscriber", icon: "crown" },
      { code: "completed_100", name: "100 Zleceń", description: "Completed 100 bookings", icon: "medal" },
      { code: "completed_500", name: "500 Zleceń", description: "Completed 500 bookings", icon: "medal" },
      { code: "completed_1000", name: "1000 Zleceń", description: "Completed 1000 bookings", icon: "trophy" },
    ];
    for (const badge of defaultBadges) {
      await db.insert(badges).values(badge);
    }
  }
}

const storage = new DbStorage();
seedServices(storage).catch((err) => console.error("Failed to seed services:", err.message));
seedBadges(storage).catch((err) => console.error("Failed to seed badges:", err.message));

export { storage };
