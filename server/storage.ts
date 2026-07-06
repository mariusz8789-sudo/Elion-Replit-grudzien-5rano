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
  users, companies, drivers, vehicles, services, bookings, quotes, offers,
  messages, attachments, reviews, trackingUpdates, notifications,
  marketplaceListings, staffSharing, resourceSharing, announcements,
  badges, badgeAwards, coupons, couponRedemptions, referralRewards, bookingTransfers
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

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
    return await db.select().from(companies);
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
    return await db.select().from(drivers);
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
    return await db.select().from(bookings).orderBy(desc(bookings.createdAt));
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
    // Get the offer to be accepted
    const offerResult = await db.select().from(offers).where(eq(offers.id, offerId));
    const offer = offerResult[0];
    
    if (!offer) {
      return undefined;
    }

    // Update the offer status to accepted
    const updatedOffer = await db.update(offers)
      .set({ status: "accepted" })
      .where(eq(offers.id, offerId))
      .returning();

    // Reject all other offers for the same booking
    await db.update(offers)
      .set({ status: "rejected" })
      .where(and(
        eq(offers.bookingId, offer.bookingId),
        sql`${offers.id} != ${offerId}`
      ));

    // Update the booking with the accepted offer details
    if (offer.companyId && offer.driverId && offer.vehicleId) {
      await this.assignCompanyToBooking(
        offer.bookingId,
        offer.companyId,
        offer.driverId,
        offer.vehicleId
      );
    }

    return updatedOffer[0];
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
seedServices(storage);
seedBadges(storage);

export { storage };
