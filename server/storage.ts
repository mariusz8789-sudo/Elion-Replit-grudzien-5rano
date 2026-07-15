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
  type Badge, type BadgeAward,
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
  type CapacityPosting, type InsertCapacityPosting,
  type CapacityBooking, type InsertCapacityBooking,
  type EnvironmentalCalculation,
  type Skill, type InsertSkill,
  type WorkerProfile, type InsertWorkerProfile,
  type WorkerSkill, type InsertWorkerSkill,
  type RecurringRouteSubscription, type InsertRecurringRouteSubscription,
  type CompanyService, type InsertCompanyService,
  users, companies, drivers, vehicles, services, bookings, quotes, offers,
  messages, attachments, reviews, trackingUpdates, notifications,
  marketplaceListings, staffSharing, resourceSharing, announcements,
  badges, badgeAwards, coupons, couponRedemptions, referralRewards, bookingTransfers,
  driverAvailability, driverTimeOff, calendarConnections, cargoItems, messageTranslations,
  calls, verificationDocuments, deviceFingerprints, riskScores, auditLogs,
  apiKeys, webhookSubscriptions, webhookDeliveries,
  capacityPostings, capacityBookings, environmentalCalculations,
  skills, workerProfiles, workerSkills, recurringRouteSubscriptions, companyServices
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, or, gte, lte, lt, isNull, inArray, ilike } from "drizzle-orm";
import { randomUUID } from "crypto";
import { encryptSecret, decryptSecret } from "./lib/crypto";

export interface IStorage {
  // User operations
  getAllUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  linkUserToCompany(userId: string, companyId: string, role: "company" | "driver"): Promise<User | undefined>;
  getCompanyUsers(companyId: string): Promise<User[]>;

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
  updateBookingDriver(id: string, driverId: string): Promise<Booking | undefined>;
  updateBookingCo2(id: string, co2Emission: string): Promise<Booking | undefined>;
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

  // Environmental calculation operations
  createEnvironmentalCalculation(data: {
    bookingId?: string | null; distanceKm: number; vehicleType: string; estimatedCo2Kg: number;
    baselineVehicleType: string; baselineCo2Kg: number; co2SavedKg: number;
    methodology: string; methodologyVersion: number;
  }): Promise<EnvironmentalCalculation>;
  getBookingEnvironmentalCalculation(bookingId: string): Promise<EnvironmentalCalculation | undefined>;
  getCompanyEnvironmentalSummary(companyId: string): Promise<{ totalTrips: number; totalCo2Kg: number; totalCo2SavedKg: number; avgCo2PerTripKg: number }>;
  getUserMonthlyEnvironmentalSummary(userId: string, months?: number): Promise<Array<{ month: string; co2Kg: number; co2SavedKg: number; trips: number }>>;

  // Skills engine operations
  getAllSkills(): Promise<Skill[]>;
  createSkill(skill: InsertSkill): Promise<Skill>;
  getWorkerProfile(id: string): Promise<WorkerProfile | undefined>;
  getWorkerProfileByUserId(userId: string): Promise<WorkerProfile | undefined>;
  createWorkerProfile(profile: InsertWorkerProfile): Promise<WorkerProfile>;
  updateWorkerProfile(id: string, updates: Partial<InsertWorkerProfile>): Promise<WorkerProfile | undefined>;
  getCompanyWorkerProfiles(companyId: string): Promise<WorkerProfile[]>;
  incrementWorkerCompletedJobs(profileId: string): Promise<void>;
  getProfileSkills(profileId: string): Promise<Array<WorkerSkill & { skill: Skill }>>;
  setWorkerSkill(entry: InsertWorkerSkill): Promise<WorkerSkill>;
  removeWorkerSkill(profileId: string, skillId: string): Promise<void>;
  findCandidatesForSkill(skillId: string): Promise<Array<WorkerProfile & { experienceLevel: string; yearsExperience: number | null; hasRequiredCertification: boolean }>>;
  getExpiringVerificationDocuments(withinDays: number): Promise<VerificationDocument[]>;
  markVerificationDocumentExpiryNotified(id: string): Promise<void>;

  // Professional services operations (company-level service offerings, reusing the skills catalog)
  getCompanyServices(companyId: string): Promise<Array<CompanyService & { skill: Skill }>>;
  setCompanyService(companyId: string, entry: InsertCompanyService): Promise<CompanyService>;
  removeCompanyService(id: string, companyId: string): Promise<boolean>;
  searchCompanyServices(filter: { skillId?: string; category?: string }): Promise<Array<CompanyService & { skill: Skill; company: Company }>>;

  // Notification operations
  getUserNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string, userId: string): Promise<Notification | undefined>;
  
  // Marketplace operations
  getAllMarketplaceListings(): Promise<MarketplaceListing[]>;
  getMarketplaceListing(id: string): Promise<MarketplaceListing | undefined>;
  createMarketplaceListing(listing: InsertMarketplaceListing, userId: string, companyId: string | null): Promise<MarketplaceListing>;
  updateMarketplaceListing(id: string, available: boolean): Promise<MarketplaceListing | undefined>;
  
  // Staff sharing operations
  getAllStaffSharing(): Promise<StaffSharing[]>;
  getStaffSharing(id: string): Promise<StaffSharing | undefined>;
  getCompanyStaffSharing(companyId: string): Promise<StaffSharing[]>;
  createStaffSharing(staffSharing: InsertStaffSharing): Promise<StaffSharing>;
  updateStaffSharingStatus(id: string, fromStatuses: string[], toStatus: string, borrowerCompanyId?: string | null): Promise<StaffSharing | undefined>;

  // Resource sharing operations
  getAllResourceSharing(): Promise<ResourceSharing[]>;
  getResourceSharing(id: string): Promise<ResourceSharing | undefined>;
  getAvailableResourceSharing(resourceType?: string): Promise<ResourceSharing[]>;
  createResourceSharing(resourceSharing: InsertResourceSharing): Promise<ResourceSharing>;
  updateResourceSharingStatus(id: string, fromStatuses: string[], toStatus: string, requesterCompanyId?: string | null): Promise<ResourceSharing | undefined>;

  // Capacity matching operations (route-connected spare capacity / empty-return matching)
  createCapacityPosting(posting: InsertCapacityPosting): Promise<CapacityPosting>;
  getCapacityPosting(id: string): Promise<CapacityPosting | undefined>;
  getCompanyCapacityPostings(companyId: string): Promise<CapacityPosting[]>;
  matchCapacityPostings(params: {
    from?: string; to?: string; date?: Date;
    minVolumeM3?: number; minWeightKg?: number; minPalletSpaces?: number;
    temperatureControlled?: boolean; adrCapable?: boolean; tailLift?: boolean;
  }): Promise<CapacityPosting[]>;
  cancelCapacityPosting(id: string, companyId: string): Promise<CapacityPosting | undefined>;
  createCapacityBooking(booking: InsertCapacityBooking, priceEur: string): Promise<CapacityBooking>;
  getCapacityBooking(id: string): Promise<CapacityBooking | undefined>;
  getPostingCapacityBookings(postingId: string): Promise<CapacityBooking[]>;
  getCustomerCapacityBookings(customerId: string): Promise<CapacityBooking[]>;
  acceptCapacityBooking(id: string): Promise<{ booking?: CapacityBooking; error?: string }>;
  updateCapacityBookingStatus(id: string, fromStatuses: string[], toStatus: "rejected" | "cancelled"): Promise<CapacityBooking | undefined>;

  // Return Trip Marketplace: recurring-route subscriptions
  createRouteSubscription(sub: InsertRecurringRouteSubscription): Promise<RecurringRouteSubscription>;
  getCompanyRouteSubscriptions(companyId: string): Promise<RecurringRouteSubscription[]>;
  deleteRouteSubscription(id: string, companyId: string): Promise<boolean>;
  findMatchingRouteSubscriptions(fromAddress: string, toAddress: string): Promise<RecurringRouteSubscription[]>;

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
  getDriverEnvironmentalSummary(driverId: string): Promise<{ totalTrips: number; totalCo2SavedKg: number }>;
  getUserEnvironmentalSummary(userId: string): Promise<{ totalTrips: number; totalCo2SavedKg: number }>;
  checkAndAwardGreenCustomerBadge(userId: string): Promise<void>;

  // Leaderboard operations
  getCompanyLeaderboard(limit?: number): Promise<Company[]>;
  getDriverLeaderboard(limit?: number): Promise<Driver[]>;

  // Coupon operations
  getCouponByCode(code: string): Promise<Coupon | undefined>;
  createCoupon(coupon: InsertCoupon): Promise<Coupon>;
  redeemCoupon(couponId: string, userId: string, bookingId: string | undefined, discountApplied: string): Promise<CouponRedemption | undefined>;
  linkCouponRedemptionToBooking(redemptionId: string, bookingId: string): Promise<void>;

  // Referral operations
  getReferralRewards(userId: string): Promise<ReferralReward[]>;
  hasReferralRewardForReferredUser(referredUserId: string): Promise<boolean>;
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
  getCargoItem(id: string): Promise<CargoItem | undefined>;
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
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt)).limit(500);
  }

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

  // Only links a user who isn't already linked to a company, so a company-onboarding
  // request can't silently reassign an existing driver/company-owner to a different one.
  async linkUserToCompany(userId: string, companyId: string, role: "company" | "driver"): Promise<User | undefined> {
    const result = await db.update(users)
      .set({ companyId, role })
      .where(and(eq(users.id, userId), isNull(users.companyId)))
      .returning();
    return result[0];
  }

  async getCompanyUsers(companyId: string): Promise<User[]> {
    return await db.select().from(users).where(eq(users.companyId, companyId));
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

  async getDriverByUserId(userId: string): Promise<Driver | undefined> {
    const result = await db.select().from(drivers).where(eq(drivers.userId, userId));
    return result[0];
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
      .orderBy(desc(bookings.createdAt))
      .limit(500);
  }

  async getCompanyBookings(companyId: string): Promise<Booking[]> {
    return await db.select().from(bookings)
      .where(eq(bookings.companyId, companyId))
      .orderBy(desc(bookings.createdAt))
      .limit(500);
  }

  // Bookings the company has already committed to (status "accepted") but hasn't dispatched
  // to a specific driver yet - the pool of jobs eligible for QR/NFC instant driver pairing.
  async getCompanyUnassignedBookings(companyId: string): Promise<Booking[]> {
    return await db.select().from(bookings)
      .where(and(
        eq(bookings.companyId, companyId),
        isNull(bookings.driverId),
        eq(bookings.status, "accepted"),
      ))
      .orderBy(desc(bookings.createdAt));
  }

  // Race-safe self-assignment: a driver scans/taps a job's QR/NFC code and claims it. The
  // conditional WHERE re-validates company membership and that nobody else claimed it first,
  // rather than trusting whatever the scanned code claims.
  async claimBookingForDriver(bookingId: string, driverId: string, companyId: string): Promise<Booking | undefined> {
    const result = await db.update(bookings)
      .set({ driverId, updatedAt: new Date() })
      .where(and(
        eq(bookings.id, bookingId),
        eq(bookings.companyId, companyId),
        isNull(bookings.driverId),
        eq(bookings.status, "accepted"),
      ))
      .returning();
    return result[0];
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

  async updateBookingDriver(id: string, driverId: string): Promise<Booking | undefined> {
    const result = await db.update(bookings)
      .set({ driverId, updatedAt: new Date() })
      .where(eq(bookings.id, id))
      .returning();
    return result[0];
  }

  async updateBookingCo2(id: string, co2Emission: string): Promise<Booking | undefined> {
    const result = await db.update(bookings)
      .set({ co2Emission, updatedAt: new Date() })
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

    // Conditional update guards against a race between concurrent assignment attempts (or
    // against the offer-acceptance flow assigning the same booking first): only succeeds if
    // the booking hasn't already been assigned to a company.
    const result = await db.update(bookings)
      .set({ companyId, driverId, vehicleId, status: "accepted", updatedAt: new Date() })
      .where(and(eq(bookings.id, bookingId), inArray(bookings.status, ["draft", "posted"])))
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
      // companyId is required on every offer, but driverId/vehicleId are optional - a
      // company can submit a bid before deciding which specific driver/vehicle to assign
      // (and do so later via the dedicated assign routes). Previously this whole block was
      // gated on ALL THREE being present, so any offer submitted without a driverId - which
      // is exactly what the Company Dashboard's offer form does - silently left the booking
      // unassigned and still "posted" even though the offer itself showed "accepted".
      if (offer.driverId) {
        const driverResult = await tx.select().from(drivers).where(eq(drivers.id, offer.driverId));
        const driver = driverResult[0];
        if (!driver || driver.companyId !== offer.companyId) {
          throw new Error("Driver not found or does not belong to this company");
        }
      }
      if (offer.vehicleId) {
        const vehicleResult = await tx.select().from(vehicles).where(eq(vehicles.id, offer.vehicleId));
        const vehicle = vehicleResult[0];
        if (!vehicle || vehicle.companyId !== offer.companyId) {
          throw new Error("Vehicle not found or does not belong to this company");
        }
      }
      await tx.update(bookings)
        .set({
          companyId: offer.companyId,
          ...(offer.driverId ? { driverId: offer.driverId } : {}),
          ...(offer.vehicleId ? { vehicleId: offer.vehicleId } : {}),
          status: "accepted",
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, offer.bookingId));

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
    // Cap to the most recent 500 messages (fetched newest-first so the cap doesn't strand
    // the conversation on its oldest messages), then restore ascending order for display.
    const recent = await db.select().from(messages)
      .where(eq(messages.bookingId, bookingId))
      .orderBy(desc(messages.createdAt))
      .limit(500);
    return recent.reverse();
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

    // Update company rating using a SQL aggregate instead of pulling every review row for
    // this company into memory on each write — that read only gets slower as reviews grow.
    if (insertReview.companyId) {
      const [stats] = await db
        .select({
          avgRating: sql<string>`avg(${reviews.rating})`,
          reviewCount: sql<number>`count(*)::int`,
        })
        .from(reviews)
        .where(eq(reviews.companyId, insertReview.companyId));

      await db.update(companies)
        .set({
          rating: Number(stats.avgRating).toFixed(2),
          totalReviews: stats.reviewCount,
        })
        .where(eq(companies.id, insertReview.companyId));
    }

    return result[0];
  }

  // === TRACKING OPERATIONS ===
  async getBookingTracking(bookingId: string): Promise<TrackingUpdate[]> {
    // Cap to the most recent 500 pings (newest-first), then restore chronological order so
    // the map still draws the route correctly.
    const recent = await db.select().from(trackingUpdates)
      .where(eq(trackingUpdates.bookingId, bookingId))
      .orderBy(desc(trackingUpdates.createdAt))
      .limit(500);
    return recent.reverse();
  }

  async createTrackingUpdate(insertUpdate: InsertTrackingUpdate): Promise<TrackingUpdate> {
    const result = await db.insert(trackingUpdates).values(insertUpdate).returning();
    return result[0];
  }

  // === ENVIRONMENTAL CALCULATION OPERATIONS ===
  async createEnvironmentalCalculation(data: {
    bookingId?: string | null;
    distanceKm: number;
    vehicleType: string;
    estimatedCo2Kg: number;
    baselineVehicleType: string;
    baselineCo2Kg: number;
    co2SavedKg: number;
    methodology: string;
    methodologyVersion: number;
  }): Promise<EnvironmentalCalculation> {
    const result = await db.insert(environmentalCalculations).values({
      bookingId: data.bookingId ?? null,
      distanceKm: String(data.distanceKm),
      vehicleType: data.vehicleType,
      estimatedCo2Kg: String(data.estimatedCo2Kg),
      baselineVehicleType: data.baselineVehicleType,
      baselineCo2Kg: String(data.baselineCo2Kg),
      co2SavedKg: String(data.co2SavedKg),
      methodology: data.methodology,
      methodologyVersion: data.methodologyVersion,
    }).returning();
    return result[0];
  }

  async getBookingEnvironmentalCalculation(bookingId: string): Promise<EnvironmentalCalculation | undefined> {
    const result = await db.select().from(environmentalCalculations)
      .where(eq(environmentalCalculations.bookingId, bookingId))
      .orderBy(desc(environmentalCalculations.createdAt))
      .limit(1);
    return result[0];
  }

  async getCompanyEnvironmentalSummary(companyId: string): Promise<{ totalTrips: number; totalCo2Kg: number; totalCo2SavedKg: number; avgCo2PerTripKg: number }> {
    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_trips,
        COALESCE(SUM(ec.estimated_co2_kg), 0)::float AS total_co2_kg,
        COALESCE(SUM(ec.co2_saved_kg), 0)::float AS total_co2_saved_kg,
        COALESCE(AVG(ec.estimated_co2_kg), 0)::float AS avg_co2_per_trip_kg
      FROM environmental_calculations ec
      JOIN bookings b ON b.id = ec.booking_id
      WHERE b.company_id = ${companyId}
    `);
    const row = result.rows[0] as any;
    return {
      totalTrips: Number(row?.total_trips ?? 0),
      totalCo2Kg: Number(row?.total_co2_kg ?? 0),
      totalCo2SavedKg: Number(row?.total_co2_saved_kg ?? 0),
      avgCo2PerTripKg: Number(row?.avg_co2_per_trip_kg ?? 0),
    };
  }

  async getUserMonthlyEnvironmentalSummary(userId: string, months = 6): Promise<Array<{ month: string; co2Kg: number; co2SavedKg: number; trips: number }>> {
    const result = await db.execute(sql`
      SELECT
        to_char(date_trunc('month', ec.created_at), 'YYYY-MM') AS month,
        COALESCE(SUM(ec.estimated_co2_kg), 0)::float AS co2_kg,
        COALESCE(SUM(ec.co2_saved_kg), 0)::float AS co2_saved_kg,
        COUNT(*)::int AS trips
      FROM environmental_calculations ec
      JOIN bookings b ON b.id = ec.booking_id
      WHERE b.user_id = ${userId} AND ec.created_at >= now() - (${months}::text || ' months')::interval
      GROUP BY 1
      ORDER BY 1
    `);
    return result.rows.map((r: any) => ({
      month: r.month,
      co2Kg: Number(r.co2_kg),
      co2SavedKg: Number(r.co2_saved_kg),
      trips: Number(r.trips),
    }));
  }

  // === SKILLS ENGINE OPERATIONS ===
  async getAllSkills(): Promise<Skill[]> {
    return await db.select().from(skills).orderBy(skills.category, skills.name);
  }

  async createSkill(skill: InsertSkill): Promise<Skill> {
    const result = await db.insert(skills).values(skill).returning();
    return result[0];
  }

  async getWorkerProfile(id: string): Promise<WorkerProfile | undefined> {
    const result = await db.select().from(workerProfiles).where(eq(workerProfiles.id, id));
    return result[0];
  }

  async getWorkerProfileByUserId(userId: string): Promise<WorkerProfile | undefined> {
    const result = await db.select().from(workerProfiles).where(eq(workerProfiles.userId, userId));
    return result[0];
  }

  async createWorkerProfile(profile: InsertWorkerProfile): Promise<WorkerProfile> {
    const result = await db.insert(workerProfiles).values(profile).returning();
    return result[0];
  }

  async updateWorkerProfile(id: string, updates: Partial<InsertWorkerProfile>): Promise<WorkerProfile | undefined> {
    const result = await db.update(workerProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(workerProfiles.id, id))
      .returning();
    return result[0];
  }

  async getCompanyWorkerProfiles(companyId: string): Promise<WorkerProfile[]> {
    return await db.select().from(workerProfiles).where(eq(workerProfiles.companyId, companyId));
  }

  async incrementWorkerCompletedJobs(profileId: string): Promise<void> {
    await db.update(workerProfiles)
      .set({ completedJobs: sql`${workerProfiles.completedJobs} + 1`, updatedAt: new Date() })
      .where(eq(workerProfiles.id, profileId));
  }

  async getProfileSkills(profileId: string): Promise<Array<WorkerSkill & { skill: Skill }>> {
    const rows = await db.select({ workerSkill: workerSkills, skill: skills })
      .from(workerSkills)
      .innerJoin(skills, eq(workerSkills.skillId, skills.id))
      .where(eq(workerSkills.profileId, profileId));
    return rows.map((r) => ({ ...r.workerSkill, skill: r.skill }));
  }

  async setWorkerSkill(entry: InsertWorkerSkill): Promise<WorkerSkill> {
    const result = await db.insert(workerSkills)
      .values(entry)
      .onConflictDoUpdate({
        target: [workerSkills.profileId, workerSkills.skillId],
        set: { experienceLevel: entry.experienceLevel, yearsExperience: entry.yearsExperience },
      })
      .returning();
    return result[0];
  }

  async removeWorkerSkill(profileId: string, skillId: string): Promise<void> {
    await db.delete(workerSkills).where(and(eq(workerSkills.profileId, profileId), eq(workerSkills.skillId, skillId)));
  }

  // Candidates for a given skill, each annotated with whether they hold a currently-valid
  // (approved, unexpired) certification if the skill requires one - used by Team Matching so
  // licensed-only skills (electrical, gas, etc.) can be filtered to genuinely qualified workers
  // rather than matching on the skill tag alone.
  async findCandidatesForSkill(skillId: string): Promise<Array<WorkerProfile & { experienceLevel: string; yearsExperience: number | null; hasRequiredCertification: boolean }>> {
    const skillResult = await db.select().from(skills).where(eq(skills.id, skillId));
    const skill = skillResult[0];
    if (!skill) return [];

    const rows = await db.select({ profile: workerProfiles, workerSkill: workerSkills })
      .from(workerSkills)
      .innerJoin(workerProfiles, eq(workerSkills.profileId, workerProfiles.id))
      .where(and(eq(workerSkills.skillId, skillId), eq(workerProfiles.available, true)));

    const candidates = await Promise.all(rows.map(async (r) => {
      let hasRequiredCertification = true;
      if (skill.requiresCertification) {
        const now = new Date();
        const docs = await db.select().from(verificationDocuments).where(and(
          eq(verificationDocuments.holderType, "user"),
          eq(verificationDocuments.holderId, r.profile.userId),
          eq(verificationDocuments.docType, skill.requiresCertification),
          eq(verificationDocuments.status, "approved"),
        ));
        hasRequiredCertification = docs.some((d) => !d.expiresAt || d.expiresAt > now);
      }
      return {
        ...r.profile,
        experienceLevel: r.workerSkill.experienceLevel,
        yearsExperience: r.workerSkill.yearsExperience,
        hasRequiredCertification,
      };
    }));
    return candidates;
  }

  async getExpiringVerificationDocuments(withinDays: number): Promise<VerificationDocument[]> {
    const now = new Date();
    const cutoff = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
    return await db.select().from(verificationDocuments).where(and(
      eq(verificationDocuments.status, "approved"),
      sql`${verificationDocuments.expiresAt} IS NOT NULL`,
      sql`${verificationDocuments.expiryNotifiedAt} IS NULL`,
      gte(verificationDocuments.expiresAt, now),
      lte(verificationDocuments.expiresAt, cutoff),
    ));
  }

  async markVerificationDocumentExpiryNotified(id: string): Promise<void> {
    await db.update(verificationDocuments).set({ expiryNotifiedAt: new Date() }).where(eq(verificationDocuments.id, id));
  }

  // === PROFESSIONAL SERVICES OPERATIONS ===
  async getCompanyServices(companyId: string): Promise<Array<CompanyService & { skill: Skill }>> {
    const rows = await db.select({ companyService: companyServices, skill: skills })
      .from(companyServices)
      .innerJoin(skills, eq(companyServices.skillId, skills.id))
      .where(eq(companyServices.companyId, companyId));
    return rows.map((r) => ({ ...r.companyService, skill: r.skill }));
  }

  async setCompanyService(companyId: string, entry: InsertCompanyService): Promise<CompanyService> {
    const result = await db.insert(companyServices)
      .values({ ...entry, companyId })
      .onConflictDoUpdate({
        target: [companyServices.companyId, companyServices.skillId],
        set: { description: entry.description, priceFromEur: entry.priceFromEur, active: entry.active ?? true },
      })
      .returning();
    return result[0];
  }

  async removeCompanyService(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(companyServices)
      .where(and(eq(companyServices.id, id), eq(companyServices.companyId, companyId)))
      .returning();
    return result.length > 0;
  }

  async searchCompanyServices(filter: { skillId?: string; category?: string }): Promise<Array<CompanyService & { skill: Skill; company: Company }>> {
    const conditions = [eq(companyServices.active, true)];
    if (filter.skillId) conditions.push(eq(companyServices.skillId, filter.skillId));
    if (filter.category) conditions.push(eq(skills.category, filter.category));

    const rows = await db.select({ companyService: companyServices, skill: skills, company: companies })
      .from(companyServices)
      .innerJoin(skills, eq(companyServices.skillId, skills.id))
      .innerJoin(companies, eq(companyServices.companyId, companies.id))
      .where(and(...conditions))
      .orderBy(desc(companies.rating));
    return rows.map((r) => ({ ...r.companyService, skill: r.skill, company: r.company }));
  }

  // === NOTIFICATION OPERATIONS ===
  async getUserNotifications(userId: string): Promise<Notification[]> {
    return await db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(500);
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const result = await db.insert(notifications).values(insertNotification).returning();
    return result[0];
  }

  async markNotificationRead(id: string, userId: string): Promise<Notification | undefined> {
    const result = await db.update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
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

  async createMarketplaceListing(insertListing: InsertMarketplaceListing, userId: string, companyId: string | null): Promise<MarketplaceListing> {
    const result = await db.insert(marketplaceListings).values({ ...insertListing, userId, companyId }).returning();
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

  async getStaffSharing(id: string): Promise<StaffSharing | undefined> {
    const result = await db.select().from(staffSharing).where(eq(staffSharing.id, id));
    return result[0];
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

  // Conditional on the row's *current* status so two concurrent requests for the same
  // "available" listing can't both win (last write wins would silently overwrite one
  // borrower's request with another's), and so a party can't skip a state (e.g. a borrower
  // self-accepting their own request straight to "booked" without the lender's action).
  async updateStaffSharingStatus(
    id: string,
    fromStatuses: string[],
    toStatus: string,
    borrowerCompanyId?: string | null,
  ): Promise<StaffSharing | undefined> {
    const result = await db.update(staffSharing)
      .set({ status: toStatus, ...(borrowerCompanyId !== undefined ? { borrowerCompanyId } : {}) })
      .where(and(eq(staffSharing.id, id), inArray(staffSharing.status, fromStatuses)))
      .returning();
    return result[0];
  }

  // === RESOURCE SHARING OPERATIONS ===
  async getAllResourceSharing(): Promise<ResourceSharing[]> {
    return await db.select().from(resourceSharing)
      .orderBy(desc(resourceSharing.createdAt));
  }

  async getResourceSharing(id: string): Promise<ResourceSharing | undefined> {
    const result = await db.select().from(resourceSharing).where(eq(resourceSharing.id, id));
    return result[0];
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

  // Same conditional-on-current-status guard as updateStaffSharingStatus, for the same reason.
  async updateResourceSharingStatus(
    id: string,
    fromStatuses: string[],
    toStatus: string,
    requesterCompanyId?: string | null,
  ): Promise<ResourceSharing | undefined> {
    const result = await db.update(resourceSharing)
      // Keep the `available` boolean (used by the resourceType-filtered browse query) in
      // lockstep with `status` - previously these could drift, leaving a requested/booked
      // resource still showing as available to other browsers.
      .set({
        status: toStatus,
        available: toStatus === "available",
        ...(requesterCompanyId !== undefined ? { requesterCompanyId } : {}),
      })
      .where(and(eq(resourceSharing.id, id), inArray(resourceSharing.status, fromStatuses)))
      .returning();
    return result[0];
  }

  // === CAPACITY MATCHING OPERATIONS (route-connected spare capacity) ===
  async createCapacityPosting(posting: InsertCapacityPosting): Promise<CapacityPosting> {
    const result = await db.insert(capacityPostings).values(posting).returning();
    return result[0];
  }

  async getCapacityPosting(id: string): Promise<CapacityPosting | undefined> {
    const result = await db.select().from(capacityPostings).where(eq(capacityPostings.id, id));
    return result[0];
  }

  async getCompanyCapacityPostings(companyId: string): Promise<CapacityPosting[]> {
    return await db.select().from(capacityPostings)
      .where(eq(capacityPostings.companyId, companyId))
      .orderBy(desc(capacityPostings.createdAt));
  }

  async cancelCapacityPosting(id: string, companyId: string): Promise<CapacityPosting | undefined> {
    const result = await db.update(capacityPostings)
      .set({ status: "cancelled" })
      .where(and(eq(capacityPostings.id, id), eq(capacityPostings.companyId, companyId), eq(capacityPostings.status, "open")))
      .returning();
    return result[0];
  }

  // Deterministic matching: substring match on the free-text route endpoints (works with
  // zero external dependencies - no geocoding required), an optional departure-date overlap
  // check, and a remaining-capacity floor. This is the engine MoveX AI Core can later
  // layer smarter ranking on top of; it must already return correct, real matches without it.
  async matchCapacityPostings(params: {
    from?: string; to?: string; date?: Date;
    minVolumeM3?: number; minWeightKg?: number; minPalletSpaces?: number;
    temperatureControlled?: boolean; adrCapable?: boolean; tailLift?: boolean;
  }): Promise<CapacityPosting[]> {
    const conditions = [eq(capacityPostings.status, "open")];
    if (params.from) conditions.push(ilike(capacityPostings.fromAddress, `%${params.from}%`));
    if (params.to) conditions.push(ilike(capacityPostings.toAddress, `%${params.to}%`));
    if (params.date) {
      conditions.push(lte(capacityPostings.departureWindowStart, params.date));
      conditions.push(gte(capacityPostings.departureWindowEnd, params.date));
    }
    if (params.minVolumeM3 !== undefined) conditions.push(gte(capacityPostings.freeVolumeM3, String(params.minVolumeM3)));
    if (params.minWeightKg !== undefined) conditions.push(gte(capacityPostings.freeWeightKg, String(params.minWeightKg)));
    if (params.minPalletSpaces !== undefined) conditions.push(gte(capacityPostings.freePalletSpaces, params.minPalletSpaces));
    if (params.temperatureControlled) conditions.push(eq(capacityPostings.temperatureControlled, true));
    if (params.adrCapable) conditions.push(eq(capacityPostings.adrCapable, true));
    if (params.tailLift) conditions.push(eq(capacityPostings.tailLift, true));

    return await db.select().from(capacityPostings)
      .where(and(...conditions))
      .orderBy(capacityPostings.departureWindowStart)
      .limit(50);
  }

  async createCapacityBooking(booking: InsertCapacityBooking, priceEur: string): Promise<CapacityBooking> {
    const result = await db.insert(capacityBookings).values({ ...booking, priceEur }).returning();
    return result[0];
  }

  async getCapacityBooking(id: string): Promise<CapacityBooking | undefined> {
    const result = await db.select().from(capacityBookings).where(eq(capacityBookings.id, id));
    return result[0];
  }

  async getPostingCapacityBookings(postingId: string): Promise<CapacityBooking[]> {
    return await db.select().from(capacityBookings)
      .where(eq(capacityBookings.postingId, postingId))
      .orderBy(desc(capacityBookings.createdAt));
  }

  async getCustomerCapacityBookings(customerId: string): Promise<CapacityBooking[]> {
    return await db.select().from(capacityBookings)
      .where(eq(capacityBookings.customerId, customerId))
      .orderBy(desc(capacityBookings.createdAt));
  }

  // Atomic: the posting's remaining capacity is only decremented if it still has enough
  // free volume/weight/pallets AND is still open, in the same conditional UPDATE as the
  // booking's pending->accepted transition - so two carriers (or the same carrier
  // double-clicking) can never both accept requests that together overbook the posting.
  async acceptCapacityBooking(id: string): Promise<{ booking?: CapacityBooking; error?: string }> {
    return await db.transaction(async (tx) => {
      const bookingResult = await tx.select().from(capacityBookings).where(eq(capacityBookings.id, id));
      const booking = bookingResult[0];
      if (!booking) return { error: "Booking not found" };
      if (booking.status !== "pending") return { error: "This request is no longer pending" };

      const postingUpdate = await tx.update(capacityPostings)
        .set({
          freeVolumeM3: sql`${capacityPostings.freeVolumeM3} - ${booking.volumeM3}`,
          freeWeightKg: sql`${capacityPostings.freeWeightKg} - ${booking.weightKg}`,
          freePalletSpaces: sql`${capacityPostings.freePalletSpaces} - ${booking.palletSpaces}`,
        })
        .where(and(
          eq(capacityPostings.id, booking.postingId),
          eq(capacityPostings.status, "open"),
          gte(capacityPostings.freeVolumeM3, booking.volumeM3),
          gte(capacityPostings.freeWeightKg, booking.weightKg),
          gte(capacityPostings.freePalletSpaces, booking.palletSpaces),
        ))
        .returning();

      if (postingUpdate.length === 0) {
        return { error: "Not enough capacity remaining on this posting" };
      }

      const updatedBooking = await tx.update(capacityBookings)
        .set({ status: "accepted" })
        .where(and(eq(capacityBookings.id, id), eq(capacityBookings.status, "pending")))
        .returning();

      return { booking: updatedBooking[0] };
    });
  }

  async updateCapacityBookingStatus(id: string, fromStatuses: string[], toStatus: "rejected" | "cancelled"): Promise<CapacityBooking | undefined> {
    // Cancelling a booking that was already "accepted" must give its reserved capacity back
    // to the posting, or that space would be permanently lost even though nobody is using it.
    if (toStatus === "cancelled" && fromStatuses.includes("accepted")) {
      return await db.transaction(async (tx) => {
        const before = await tx.select().from(capacityBookings).where(eq(capacityBookings.id, id));
        const previousStatus = before[0]?.status;

        const updated = await tx.update(capacityBookings)
          .set({ status: toStatus })
          .where(and(eq(capacityBookings.id, id), inArray(capacityBookings.status, fromStatuses)))
          .returning();
        const booking = updated[0];
        if (!booking) return undefined;

        // Only restore capacity if this cancellation moved it out of "accepted" - a
        // pending->cancelled transition never reserved capacity in the first place.
        if (previousStatus === "accepted") {
          await tx.update(capacityPostings)
            .set({
              freeVolumeM3: sql`${capacityPostings.freeVolumeM3} + ${booking.volumeM3}`,
              freeWeightKg: sql`${capacityPostings.freeWeightKg} + ${booking.weightKg}`,
              freePalletSpaces: sql`${capacityPostings.freePalletSpaces} + ${booking.palletSpaces}`,
            })
            .where(eq(capacityPostings.id, booking.postingId));
        }
        return booking;
      });
    }

    const result = await db.update(capacityBookings)
      .set({ status: toStatus })
      .where(and(eq(capacityBookings.id, id), inArray(capacityBookings.status, fromStatuses)))
      .returning();
    return result[0];
  }

  async createRouteSubscription(sub: InsertRecurringRouteSubscription): Promise<RecurringRouteSubscription> {
    const result = await db.insert(recurringRouteSubscriptions).values(sub).returning();
    return result[0];
  }

  async getCompanyRouteSubscriptions(companyId: string): Promise<RecurringRouteSubscription[]> {
    return await db.select().from(recurringRouteSubscriptions).where(eq(recurringRouteSubscriptions.companyId, companyId));
  }

  async deleteRouteSubscription(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(recurringRouteSubscriptions)
      .where(and(eq(recurringRouteSubscriptions.id, id), eq(recurringRouteSubscriptions.companyId, companyId)))
      .returning();
    return result.length > 0;
  }

  // Same case-insensitive substring matching as the capacity search itself, so "subscribe to
  // Madrid -> Paris" reliably fires for any posting whose addresses contain those substrings.
  async findMatchingRouteSubscriptions(fromAddress: string, toAddress: string): Promise<RecurringRouteSubscription[]> {
    return await db.select().from(recurringRouteSubscriptions).where(and(
      sql`${fromAddress} ILIKE '%' || ${recurringRouteSubscriptions.fromAddress} || '%'`,
      sql`${toAddress} ILIKE '%' || ${recurringRouteSubscriptions.toAddress} || '%'`,
    ));
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

    // ON CONFLICT DO NOTHING (backed by the unique (holderType, holderId, badgeId)
    // constraint) closes a check-then-insert race where two concurrent milestone checks for
    // the same holder could otherwise both pass the "not yet awarded" check and insert a
    // duplicate award.
    const inserted = await db.insert(badgeAwards)
      .values({ holderType, holderId, badgeId: badge.id })
      .onConflictDoNothing()
      .returning();
    if (inserted.length > 0) return inserted[0];

    const existing = await db.select().from(badgeAwards).where(and(
      eq(badgeAwards.holderType, holderType),
      eq(badgeAwards.holderId, holderId),
      eq(badgeAwards.badgeId, badge.id),
    ));
    return existing[0];
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
      const envSummary = await this.getCompanyEnvironmentalSummary(holderId);
      if (envSummary.totalCo2SavedKg >= 100) {
        await this.awardBadgeIfMissing("company", holderId, "green_company");
      }
    } else {
      const envSummary = await this.getDriverEnvironmentalSummary(holderId);
      if (envSummary.totalCo2SavedKg >= 50) {
        await this.awardBadgeIfMissing("driver", holderId, "green_driver");
      }
    }
  }

  async getDriverEnvironmentalSummary(driverId: string): Promise<{ totalTrips: number; totalCo2SavedKg: number }> {
    const result = await db.execute(sql`
      SELECT COUNT(*)::int AS total_trips, COALESCE(SUM(ec.co2_saved_kg), 0)::float AS total_co2_saved_kg
      FROM environmental_calculations ec
      JOIN bookings b ON b.id = ec.booking_id
      WHERE b.driver_id = ${driverId}
    `);
    const row = result.rows[0] as any;
    return { totalTrips: Number(row?.total_trips ?? 0), totalCo2SavedKg: Number(row?.total_co2_saved_kg ?? 0) };
  }

  async getUserEnvironmentalSummary(userId: string): Promise<{ totalTrips: number; totalCo2SavedKg: number }> {
    const result = await db.execute(sql`
      SELECT COUNT(*)::int AS total_trips, COALESCE(SUM(ec.co2_saved_kg), 0)::float AS total_co2_saved_kg
      FROM environmental_calculations ec
      JOIN bookings b ON b.id = ec.booking_id
      WHERE b.user_id = ${userId}
    `);
    const row = result.rows[0] as any;
    return { totalTrips: Number(row?.total_trips ?? 0), totalCo2SavedKg: Number(row?.total_co2_saved_kg ?? 0) };
  }

  async checkAndAwardGreenCustomerBadge(userId: string): Promise<void> {
    const summary = await this.getUserEnvironmentalSummary(userId);
    if (summary.totalCo2SavedKg >= 20) {
      await this.awardBadgeIfMissing("user", userId, "green_customer");
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

  async redeemCoupon(couponId: string, userId: string, bookingId: string | undefined, discountApplied: string): Promise<CouponRedemption | undefined> {
    return await db.transaction(async (tx) => {
      // Conditional update guards against a redemption-count race between concurrent
      // bookings: the WHERE clause only succeeds if the coupon still had room left.
      const updated = await tx.update(coupons)
        .set({ timesRedeemed: sql`${coupons.timesRedeemed} + 1` })
        .where(and(
          eq(coupons.id, couponId),
          or(isNull(coupons.maxRedemptions), lt(coupons.timesRedeemed, coupons.maxRedemptions)),
        ))
        .returning();
      if (updated.length === 0) return undefined;

      const result = await tx.insert(couponRedemptions).values({ couponId, userId, bookingId, discountApplied }).returning();
      return result[0];
    });
  }

  async linkCouponRedemptionToBooking(redemptionId: string, bookingId: string): Promise<void> {
    await db.update(couponRedemptions).set({ bookingId }).where(eq(couponRedemptions.id, redemptionId));
  }

  // === REFERRAL OPERATIONS ===
  async getReferralRewards(userId: string): Promise<ReferralReward[]> {
    return await db.select().from(referralRewards)
      .where(eq(referralRewards.referrerUserId, userId))
      .orderBy(desc(referralRewards.createdAt));
  }

  async hasReferralRewardForReferredUser(referredUserId: string): Promise<boolean> {
    const result = await db.select().from(referralRewards)
      .where(eq(referralRewards.referredUserId, referredUserId))
      .limit(1);
    return result.length > 0;
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
  async getCargoItem(id: string): Promise<CargoItem | undefined> {
    const result = await db.select().from(cargoItems).where(eq(cargoItems.id, id));
    return result[0];
  }

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
