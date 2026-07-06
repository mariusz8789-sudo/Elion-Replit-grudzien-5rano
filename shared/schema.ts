import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, decimal, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === USERS & COMPANIES ===
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").unique(),
  phone: text("phone").notNull(),
  password: text("password").notNull(),
  role: text("role").notNull().default("customer"), // customer, driver, company, admin
  companyId: varchar("company_id").references(() => companies.id),
  accountType: text("account_type").default("b2c"), // b2c (individual), b2b (company)
  avatar: text("avatar"),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").unique().notNull(),
  phone: text("phone").notNull(),
  address: text("address"),
  taxId: text("tax_id"),
  licenseNumber: text("license_number"),
  insuranceNumber: text("insurance_number"),
  verified: boolean("verified").default(false),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0"),
  totalReviews: integer("total_reviews").default(0),
  subscriptionTier: text("subscription_tier").default("basic"), // basic, premium, enterprise
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  monthlyBookingLimit: integer("monthly_booking_limit").default(50), // limits per tier
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const drivers = pgTable("drivers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  licenseNumber: text("license_number").notNull(),
  licenseExpiry: timestamp("license_expiry"),
  vehicleType: text("vehicle_type"), // preferred vehicle type
  available: boolean("available").default(true),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0"),
  totalDeliveries: integer("total_deliveries").default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const vehicles = pgTable("vehicles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  driverId: varchar("driver_id").references(() => drivers.id), // assigned driver
  type: text("type").notNull(), // van, truck, lorry, etc
  licensePlate: text("license_plate").notNull(),
  capacity: decimal("capacity", { precision: 10, scale: 2 }), // in cubic meters or kg
  capacityUnit: text("capacity_unit").default("cubic_meters"), // cubic_meters, kg, liters
  images: text("images").array(), // vehicle photos showing capacity
  dimensions: text("dimensions"), // e.g., "L: 4.5m x W: 2.1m x H: 2.3m"
  available: boolean("available").default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// === SERVICES & BOOKINGS ===
export const services = pgTable("services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull(),
  pricePerMile: decimal("price_per_mile", { precision: 10, scale: 2 }).notNull(),
  icon: text("icon").notNull(),
});

export const bookings = pgTable("bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  serviceId: varchar("service_id").notNull().references(() => services.id),
  pickupAddress: text("pickup_address").notNull(),
  pickupLat: decimal("pickup_lat", { precision: 10, scale: 7 }),
  pickupLng: decimal("pickup_lng", { precision: 10, scale: 7 }),
  deliveryAddress: text("delivery_address").notNull(),
  deliveryLat: decimal("delivery_lat", { precision: 10, scale: 7 }),
  deliveryLng: decimal("delivery_lng", { precision: 10, scale: 7 }),
  pickupDate: timestamp("pickup_date").notNull(),
  estimatedDistance: decimal("estimated_distance", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("draft"), // draft, posted, accepted, in_transit, delivered, canceled
  companyId: varchar("company_id").references(() => companies.id),
  driverId: varchar("driver_id").references(() => drivers.id),
  vehicleId: varchar("vehicle_id").references(() => vehicles.id),
  notes: text("notes"),
  cargoDescription: text("cargo_description"),
  cargoWeight: decimal("cargo_weight", { precision: 10, scale: 2 }),
  isPublic: boolean("is_public").default(true), // public listing or private link
  publicLink: text("public_link"),
  paymentIntentId: text("payment_intent_id"),
  paymentStatus: text("payment_status").default("pending"), // pending, authorized, captured, failed
  co2Emission: decimal("co2_emission", { precision: 10, scale: 2 }), // kg of CO2
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const quotes = pgTable("quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId: varchar("service_id").notNull().references(() => services.id),
  pickupAddress: text("pickup_address").notNull(),
  deliveryAddress: text("delivery_address").notNull(),
  estimatedDistance: decimal("estimated_distance", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  email: text("email"),
  phone: text("phone"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// === OFFERS/BIDS ===
export const offers = pgTable("offers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull().references(() => bookings.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  driverId: varchar("driver_id").references(() => drivers.id),
  vehicleId: varchar("vehicle_id").references(() => vehicles.id),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  estimatedPickupTime: timestamp("estimated_pickup_time"),
  message: text("message"),
  status: text("status").default("pending"), // pending, accepted, rejected
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// === CHAT & ATTACHMENTS ===
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull().references(() => bookings.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  type: text("type").default("text"), // text, image, file
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const attachments = pgTable("attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull().references(() => bookings.id),
  messageId: varchar("message_id").references(() => messages.id),
  uploaderId: varchar("uploader_id").notNull().references(() => users.id),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type").notNull(), // image/jpeg, application/pdf, etc
  fileSize: integer("file_size"), // in bytes
  category: text("category").default("general"), // general, proof_of_delivery, signature
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// === REVIEWS ===
export const reviews = pgTable("reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull().references(() => bookings.id),
  reviewerId: varchar("reviewer_id").notNull().references(() => users.id),
  companyId: varchar("company_id").references(() => companies.id),
  driverId: varchar("driver_id").references(() => drivers.id),
  rating: integer("rating").notNull(), // 1-5
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// === TRACKING ===
export const trackingUpdates = pgTable("tracking_updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull().references(() => bookings.id),
  lat: decimal("lat", { precision: 10, scale: 7 }).notNull(),
  lng: decimal("lng", { precision: 10, scale: 7 }).notNull(),
  status: text("status"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// === NOTIFICATIONS ===
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").default("info"), // info, success, warning, error
  read: boolean("read").default(false),
  link: text("link"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// === MARKETPLACE ===
export const marketplaceListings = pgTable("marketplace_listings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  companyId: varchar("company_id").references(() => companies.id),
  type: text("type").notNull(), // service, product, promotion, material
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }),
  category: text("category").notNull(), // boxes, equipment, materials, services, promotion
  images: text("images").array(),
  condition: text("condition"), // new, used, like-new
  location: text("location"),
  available: boolean("available").default(true),
  views: integer("views").default(0),
  featured: boolean("featured").default(false),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// === CARPOOLING / SHARED RIDES ===
export const sharedRides = pgTable("shared_rides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driverId: varchar("driver_id").notNull().references(() => users.id),
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  departureTime: timestamp("departure_time").notNull(),
  availableSeats: integer("available_seats").notNull(),
  pricePerSeat: decimal("price_per_seat", { precision: 10, scale: 2 }).notNull(),
  vehicleInfo: text("vehicle_info"),
  distance: decimal("distance", { precision: 10, scale: 2 }),
  estimatedDuration: integer("estimated_duration"), // minutes
  status: text("status").default("active"), // active, full, completed, cancelled
  isRecurring: boolean("is_recurring").default(false),
  recurringDays: text("recurring_days").array(), // ["mon", "wed", "fri"]
  co2Saved: decimal("co2_saved", { precision: 10, scale: 2 }), // kg of CO2 saved
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const rideBookings = pgTable("ride_bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rideId: varchar("ride_id").notNull().references(() => sharedRides.id),
  passengerId: varchar("passenger_id").notNull().references(() => users.id),
  seatsBooked: integer("seats_booked").notNull().default(1),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  pickupPoint: text("pickup_point"),
  dropoffPoint: text("dropoff_point"),
  status: text("status").default("confirmed"), // confirmed, cancelled, completed
  paymentStatus: text("payment_status").default("pending"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// === STAFF SHARING ===
export const staffSharing = pgTable("staff_sharing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lenderCompanyId: varchar("lender_company_id").notNull().references(() => companies.id),
  borrowerCompanyId: varchar("borrower_company_id").notNull().references(() => companies.id),
  driverId: varchar("driver_id").notNull().references(() => drivers.id),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  status: text("status").default("pending"), // pending, approved, active, completed, cancelled
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// === RESOURCE SHARING (Vehicles, Warehouses, Equipment) ===
export const resourceSharing = pgTable("resource_sharing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerCompanyId: varchar("provider_company_id").notNull().references(() => companies.id),
  requesterCompanyId: varchar("requester_company_id").references(() => companies.id),
  resourceType: text("resource_type").notNull(), // vehicle, warehouse, equipment
  resourceId: varchar("resource_id"), // references vehicles.id or other resource tables
  title: text("title").notNull(),
  description: text("description").notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  pricePerDay: decimal("price_per_day", { precision: 10, scale: 2 }),
  location: text("location"),
  capacity: text("capacity"),
  images: text("images").array(),
  available: boolean("available").default(true),
  status: text("status").default("pending"), // pending, approved, active, completed, cancelled
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// === PROMO BOARD / ANNOUNCEMENTS ===
export const announcements = pgTable("announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // promo, discount, announcement, event
  title: text("title").notNull(),
  description: text("description").notNull(),
  discountPercent: integer("discount_percent"),
  discountCode: text("discount_code"),
  images: text("images").array(),
  link: text("link"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  targetAudience: text("target_audience").default("all"), // all, b2b, b2c, drivers
  active: boolean("active").default(true),
  views: integer("views").default(0),
  clicks: integer("clicks").default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// === INSERT SCHEMAS ===
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  role: true,
  createdAt: true,
  verified: true,
});

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  verified: true,
  rating: true,
  totalReviews: true,
});

export const insertDriverSchema = createInsertSchema(drivers).omit({
  id: true,
  createdAt: true,
  rating: true,
  totalDeliveries: true,
  available: true,
});

export const insertVehicleSchema = createInsertSchema(vehicles).omit({
  id: true,
  createdAt: true,
  available: true,
}).extend({
  capacity: z.coerce.string(),
});

export const insertServiceSchema = createInsertSchema(services).omit({
  id: true,
});

export const insertBookingSchema = createInsertSchema(bookings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  companyId: true,
  driverId: true,
  vehicleId: true,
  paymentIntentId: true,
  paymentStatus: true,
  publicLink: true,
}).extend({
  pickupDate: z.coerce.date(),
  estimatedDistance: z.coerce.string(),
  totalPrice: z.coerce.string(),
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({
  id: true,
  createdAt: true,
});

export const insertOfferSchema = createInsertSchema(offers).omit({
  id: true,
  createdAt: true,
  status: true,
}).extend({
  price: z.coerce.string(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  type: true,
});

export const insertAttachmentSchema = createInsertSchema(attachments).omit({
  id: true,
  createdAt: true,
});

export const insertReviewSchema = createInsertSchema(reviews).omit({
  id: true,
  createdAt: true,
}).extend({
  rating: z.number().min(1).max(5),
});

export const insertTrackingUpdateSchema = createInsertSchema(trackingUpdates).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  read: true,
});

export const insertMarketplaceListingSchema = createInsertSchema(marketplaceListings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  views: true,
  featured: true,
}).extend({
  price: z.coerce.string().optional(),
});

export const insertSharedRideSchema = createInsertSchema(sharedRides).omit({
  id: true,
  createdAt: true,
  status: true,
}).extend({
  departureTime: z.coerce.date(),
  pricePerSeat: z.coerce.string(),
});

export const insertRideBookingSchema = createInsertSchema(rideBookings).omit({
  id: true,
  createdAt: true,
  status: true,
  paymentStatus: true,
}).extend({
  totalPrice: z.coerce.string(),
});

export const insertStaffSharingSchema = createInsertSchema(staffSharing).omit({
  id: true,
  createdAt: true,
  status: true,
}).extend({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  hourlyRate: z.coerce.string().optional(),
});

export const insertResourceSharingSchema = createInsertSchema(resourceSharing).omit({
  id: true,
  createdAt: true,
  status: true,
  available: true,
}).extend({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  pricePerDay: z.coerce.string().optional(),
});

export const insertAnnouncementSchema = createInsertSchema(announcements).omit({
  id: true,
  createdAt: true,
  views: true,
  clicks: true,
  active: true,
}).extend({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

// === TYPES ===
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;

export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof drivers.$inferSelect;

export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehicles.$inferSelect;

export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof services.$inferSelect;

export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;

export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotes.$inferSelect;

export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Offer = typeof offers.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type Attachment = typeof attachments.$inferSelect;

export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviews.$inferSelect;

export type InsertTrackingUpdate = z.infer<typeof insertTrackingUpdateSchema>;
export type TrackingUpdate = typeof trackingUpdates.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export type InsertMarketplaceListing = z.infer<typeof insertMarketplaceListingSchema>;
export type MarketplaceListing = typeof marketplaceListings.$inferSelect;

export type InsertSharedRide = z.infer<typeof insertSharedRideSchema>;
export type SharedRide = typeof sharedRides.$inferSelect;

export type InsertRideBooking = z.infer<typeof insertRideBookingSchema>;
export type RideBooking = typeof rideBookings.$inferSelect;

export type InsertStaffSharing = z.infer<typeof insertStaffSharingSchema>;
export type StaffSharing = typeof staffSharing.$inferSelect;

export type InsertResourceSharing = z.infer<typeof insertResourceSharingSchema>;
export type ResourceSharing = typeof resourceSharing.$inferSelect;

export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Announcement = typeof announcements.$inferSelect;
