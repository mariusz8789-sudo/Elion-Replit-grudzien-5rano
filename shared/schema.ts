import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, decimal, boolean, jsonb, unique, index } from "drizzle-orm/pg-core";
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
  referralCode: text("referral_code").unique(),
  referredByCode: text("referred_by_code"), // referral code of the user who invited them
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  phoneIdx: index("users_phone_idx").on(t.phone),
  companyIdIdx: index("users_company_id_idx").on(t.companyId),
}));

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
}, (t) => ({
  companyIdIdx: index("drivers_company_id_idx").on(t.companyId),
  userIdIdx: index("drivers_user_id_idx").on(t.userId),
}));

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
}, (t) => ({
  companyIdIdx: index("vehicles_company_id_idx").on(t.companyId),
}));

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
  paymentStatus: text("payment_status").default("pending"), // pending, authorized, captured, failed, refunded
  co2Emission: decimal("co2_emission", { precision: 10, scale: 2 }), // kg of CO2
  stops: jsonb("stops").$type<Array<{ type: "pickup" | "dropoff"; address: string; lat?: number; lng?: number; order: number; note?: string }>>(),
  volumeM3: decimal("volume_m3", { precision: 10, scale: 2 }), // estimated cargo volume in cubic meters
  contractSignedAt: timestamp("contract_signed_at"),
  signatureUrl: text("signature_url"), // stored e-signature image
  couponCode: text("coupon_code"),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (t) => ({
  userIdIdx: index("bookings_user_id_idx").on(t.userId),
  companyIdIdx: index("bookings_company_id_idx").on(t.companyId),
  driverIdIdx: index("bookings_driver_id_idx").on(t.driverId),
  statusIdx: index("bookings_status_idx").on(t.status),
}));

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
}, (t) => ({
  bookingIdIdx: index("offers_booking_id_idx").on(t.bookingId),
  companyIdIdx: index("offers_company_id_idx").on(t.companyId),
}));

// === CHAT & ATTACHMENTS ===
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull().references(() => bookings.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  type: text("type").default("text"), // text, image, file
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  bookingIdIdx: index("messages_booking_id_idx").on(t.bookingId),
}));

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
}, (t) => ({
  bookingIdIdx: index("attachments_booking_id_idx").on(t.bookingId),
}));

// === REVIEWS ===
export const reviews = pgTable("reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull().references(() => bookings.id),
  reviewerId: varchar("reviewer_id").notNull().references(() => users.id),
  companyId: varchar("company_id").references(() => companies.id),
  driverId: varchar("driver_id").references(() => drivers.id),
  rating: integer("rating").notNull(), // 1-5 overall
  comment: text("comment"),
  images: text("images").array(), // photos attached to the review
  punctuality: integer("punctuality"), // 1-5 detailed criteria
  communication: integer("communication"),
  safety: integer("safety"),
  quality: integer("quality"),
  careHandling: integer("care_handling"),
  priceRating: integer("price_rating"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  companyIdIdx: index("reviews_company_id_idx").on(t.companyId),
  bookingReviewerUnique: unique().on(t.bookingId, t.reviewerId),
}));

// === TRACKING ===
export const trackingUpdates = pgTable("tracking_updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull().references(() => bookings.id),
  lat: decimal("lat", { precision: 10, scale: 7 }).notNull(),
  lng: decimal("lng", { precision: 10, scale: 7 }).notNull(),
  status: text("status"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  bookingIdIdx: index("tracking_updates_booking_id_idx").on(t.bookingId),
}));

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
}, (t) => ({
  userIdIdx: index("notifications_user_id_idx").on(t.userId),
}));

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
  borrowerCompanyId: varchar("borrower_company_id").references(() => companies.id), // set once a request is accepted
  driverId: varchar("driver_id").references(() => drivers.id), // a specific driver, if the listing is for one
  staffType: text("staff_type").notNull(), // driver, loader, warehouse, dispatcher, admin
  availability: text("availability").notNull(), // free-text availability window, e.g. "Mon-Fri 9am-5pm"
  minHours: integer("min_hours"),
  maxHours: integer("max_hours"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  status: text("status").default("available"), // available, requested, booked, completed, cancelled
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  lenderCompanyIdIdx: index("staff_sharing_lender_company_id_idx").on(t.lenderCompanyId),
  borrowerCompanyIdIdx: index("staff_sharing_borrower_company_id_idx").on(t.borrowerCompanyId),
}));

// === RESOURCE SHARING (Vehicles, Warehouses, Equipment) ===
export const resourceSharing = pgTable("resource_sharing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerCompanyId: varchar("provider_company_id").notNull().references(() => companies.id),
  requesterCompanyId: varchar("requester_company_id").references(() => companies.id),
  resourceType: text("resource_type").notNull(), // vehicle, warehouse, equipment
  resourceId: varchar("resource_id"), // references vehicles.id or other resource tables
  title: text("title").notNull(),
  description: text("description"),
  availability: text("availability"), // free-text availability window, e.g. "Weekends only"
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  pricePerDay: decimal("price_per_day", { precision: 10, scale: 2 }),
  location: text("location"),
  capacity: text("capacity"),
  images: text("images").array(),
  available: boolean("available").default(true),
  status: text("status").default("available"), // available, requested, booked, completed, cancelled
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  providerCompanyIdIdx: index("resource_sharing_provider_company_id_idx").on(t.providerCompanyId),
}));

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

// === BADGES / GAMIFICATION ===
export const badges = pgTable("badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(), // super_carrier, premium, elite, completed_100, completed_500, completed_1000
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon").default("award"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const badgeAwards = pgTable("badge_awards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  badgeId: varchar("badge_id").notNull().references(() => badges.id),
  holderType: text("holder_type").notNull(), // company, driver
  holderId: varchar("holder_id").notNull(),
  awardedAt: timestamp("awarded_at").notNull().default(sql`now()`),
}, (t) => ({
  holderIdx: index("badge_awards_holder_idx").on(t.holderType, t.holderId),
}));

// === COUPONS / PROMOTIONS ===
export const coupons = pgTable("coupons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  discountType: text("discount_type").notNull().default("percent"), // percent, fixed
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),
  minBookingAmount: decimal("min_booking_amount", { precision: 10, scale: 2 }).default("0"),
  maxRedemptions: integer("max_redemptions"), // null = unlimited
  timesRedeemed: integer("times_redeemed").default(0),
  validFrom: timestamp("valid_from").default(sql`now()`),
  validUntil: timestamp("valid_until"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const couponRedemptions = pgTable("coupon_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  couponId: varchar("coupon_id").notNull().references(() => coupons.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  bookingId: varchar("booking_id").references(() => bookings.id),
  discountApplied: decimal("discount_applied", { precision: 10, scale: 2 }).notNull(),
  redeemedAt: timestamp("redeemed_at").notNull().default(sql`now()`),
}, (t) => ({
  userIdIdx: index("coupon_redemptions_user_id_idx").on(t.userId),
  couponIdIdx: index("coupon_redemptions_coupon_id_idx").on(t.couponId),
}));

// === REFERRAL PROGRAM ===
export const referralRewards = pgTable("referral_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerUserId: varchar("referrer_user_id").notNull().references(() => users.id),
  referredUserId: varchar("referred_user_id").notNull().references(() => users.id),
  bookingId: varchar("booking_id").references(() => bookings.id), // qualifying booking that triggered the reward
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull().default("25"),
  status: text("status").notNull().default("pending"), // pending, credited, cancelled
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  creditedAt: timestamp("credited_at"),
}, (t) => ({
  referrerIdx: index("referral_rewards_referrer_idx").on(t.referrerUserId),
  referredUserUnique: unique().on(t.referredUserId),
}));

// === BOOKING TRANSFERS (resell/hand off a job to another company) ===
export const bookingTransfers = pgTable("booking_transfers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull().references(() => bookings.id),
  fromCompanyId: varchar("from_company_id").notNull().references(() => companies.id),
  toCompanyId: varchar("to_company_id").notNull().references(() => companies.id),
  transferredBy: varchar("transferred_by").notNull().references(() => users.id),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  bookingIdIdx: index("booking_transfers_booking_id_idx").on(t.bookingId),
}));

// === DRIVER AVAILABILITY CALENDAR ===
export const driverAvailability = pgTable("driver_availability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driverId: varchar("driver_id").notNull().references(() => drivers.id),
  dayOfWeek: integer("day_of_week").notNull(), // 0 = Sunday .. 6 = Saturday
  startTime: text("start_time").notNull(), // "HH:MM" 24h
  endTime: text("end_time").notNull(), // "HH:MM" 24h
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  driverIdIdx: index("driver_availability_driver_id_idx").on(t.driverId),
}));

export const driverTimeOff = pgTable("driver_time_off", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driverId: varchar("driver_id").notNull().references(() => drivers.id),
  type: text("type").notNull().default("vacation"), // vacation, sick_leave, other
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  driverIdIdx: index("driver_time_off_driver_id_idx").on(t.driverId),
}));

export const calendarConnections = pgTable("calendar_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driverId: varchar("driver_id").notNull().references(() => drivers.id),
  provider: text("provider").notNull(), // google, outlook
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  tokenExpiresAt: timestamp("token_expires_at"),
  externalCalendarId: text("external_calendar_id"),
  syncEnabled: boolean("sync_enabled").default(true),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  driverProviderUnique: unique().on(t.driverId, t.provider),
}));

// === AI CARGO RECOGNITION ===
export const cargoItems = pgTable("cargo_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull().references(() => bookings.id),
  imageUrl: text("image_url").notNull(),
  detectedLabel: text("detected_label"),
  category: text("category"), // furniture, appliance, box, fragile_item, other
  estimatedLengthCm: decimal("estimated_length_cm", { precision: 8, scale: 1 }),
  estimatedWidthCm: decimal("estimated_width_cm", { precision: 8, scale: 1 }),
  estimatedHeightCm: decimal("estimated_height_cm", { precision: 8, scale: 1 }),
  estimatedVolumeM3: decimal("estimated_volume_m3", { precision: 10, scale: 3 }),
  estimatedWeightKg: decimal("estimated_weight_kg", { precision: 10, scale: 1 }),
  fragile: boolean("fragile").default(false),
  suggestedVehicleType: text("suggested_vehicle_type"),
  confidence: decimal("confidence", { precision: 4, scale: 3 }), // 0..1
  manuallyCorrected: boolean("manually_corrected").default(false),
  aiProvider: text("ai_provider"), // which recognition provider produced this result
  rawResponse: jsonb("raw_response"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  bookingIdIdx: index("cargo_items_booking_id_idx").on(t.bookingId),
}));

// === AI MULTILINGUAL CHAT TRANSLATION ===
export const messageTranslations = pgTable("message_translations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => messages.id),
  sourceLanguage: text("source_language"),
  targetLanguage: text("target_language").notNull(),
  translatedContent: text("translated_content").notNull(),
  aiProvider: text("ai_provider"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  messageIdIdx: index("message_translations_message_id_idx").on(t.messageId, t.targetLanguage),
}));

// === VOICE / VIDEO CALLS ===
export const calls = pgTable("calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => bookings.id),
  callerId: varchar("caller_id").notNull().references(() => users.id),
  calleeId: varchar("callee_id").notNull().references(() => users.id),
  type: text("type").notNull().default("voice"), // voice, video
  status: text("status").notNull().default("ringing"), // ringing, accepted, rejected, missed, completed, failed
  startedAt: timestamp("started_at").notNull().default(sql`now()`),
  connectedAt: timestamp("connected_at"),
  endedAt: timestamp("ended_at"),
  durationSeconds: integer("duration_seconds"),
  quality: jsonb("quality"), // { avgBitrateKbps, packetLossPercent, avgJitterMs, samples }
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  callerIdx: index("calls_caller_id_idx").on(t.callerId),
  calleeIdx: index("calls_callee_id_idx").on(t.calleeId),
}));

// === IDENTITY VERIFICATION ===
export const verificationDocuments = pgTable("verification_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  holderType: text("holder_type").notNull(), // user, driver, company
  holderId: varchar("holder_id").notNull(),
  docType: text("doc_type").notNull(), // id_card, selfie, drivers_license, company_registration, insurance_certificate, vehicle_registration
  fileUrl: text("file_url").notNull(),
  status: text("status").notNull().default("pending"), // pending, approved, rejected, expired
  submittedAt: timestamp("submitted_at").notNull().default(sql`now()`),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  rejectionReason: text("rejection_reason"),
  expiresAt: timestamp("expires_at"),
}, (t) => ({
  holderIdx: index("verification_documents_holder_idx").on(t.holderType, t.holderId),
  statusIdx: index("verification_documents_status_idx").on(t.status),
}));

// === FRAUD PREVENTION ===
export const deviceFingerprints = pgTable("device_fingerprints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  fingerprintHash: text("fingerprint_hash").notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  firstSeenAt: timestamp("first_seen_at").notNull().default(sql`now()`),
  lastSeenAt: timestamp("last_seen_at").notNull().default(sql`now()`),
}, (t) => ({
  userIdIdx: index("device_fingerprints_user_id_idx").on(t.userId),
  hashIdx: index("device_fingerprints_hash_idx").on(t.fingerprintHash),
}));

export const riskScores = pgTable("risk_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subjectType: text("subject_type").notNull(), // user, booking, payment
  subjectId: varchar("subject_id").notNull(),
  score: integer("score").notNull(), // 0 (low risk) .. 100 (high risk)
  reasons: text("reasons").array(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  subjectIdx: index("risk_scores_subject_idx").on(t.subjectType, t.subjectId),
}));

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorUserId: varchar("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: varchar("target_id"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  targetIdx: index("audit_logs_target_idx").on(t.targetType, t.targetId),
}));

// === PUBLIC PARTNER API ===
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  scopes: text("scopes").array().default(sql`ARRAY['bookings:read']::text[]`),
  active: boolean("active").default(true),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  revokedAt: timestamp("revoked_at"),
}, (t) => ({
  keyHashIdx: index("api_keys_key_hash_idx").on(t.keyHash),
  companyIdIdx: index("api_keys_company_id_idx").on(t.companyId),
}));

export const webhookSubscriptions = pgTable("webhook_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events").array().notNull(),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  companyIdIdx: index("webhook_subscriptions_company_id_idx").on(t.companyId),
}));

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subscriptionId: varchar("subscription_id").notNull().references(() => webhookSubscriptions.id),
  event: text("event").notNull(),
  payload: jsonb("payload").notNull(),
  responseStatus: integer("response_status"),
  success: boolean("success").notNull().default(false),
  error: text("error"),
  attemptedAt: timestamp("attempted_at").notNull().default(sql`now()`),
}, (t) => ({
  subscriptionIdIdx: index("webhook_deliveries_subscription_id_idx").on(t.subscriptionId),
}));

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
  contractSignedAt: true,
  signatureUrl: true,
  discountAmount: true,
}).extend({
  pickupDate: z.coerce.date(),
  estimatedDistance: z.coerce.string(),
  totalPrice: z.coerce.string(),
  volumeM3: z.coerce.string().optional(),
  couponCode: z.string().optional(),
  stops: z.array(z.object({
    type: z.enum(["pickup", "dropoff"]),
    address: z.string(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    order: z.number(),
    note: z.string().optional(),
  })).optional(),
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
  punctuality: z.number().min(1).max(5).optional(),
  communication: z.number().min(1).max(5).optional(),
  safety: z.number().min(1).max(5).optional(),
  quality: z.number().min(1).max(5).optional(),
  careHandling: z.number().min(1).max(5).optional(),
  priceRating: z.number().min(1).max(5).optional(),
  images: z.array(z.string()).optional(),
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
  borrowerCompanyId: true,
}).extend({
  driverId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  hourlyRate: z.coerce.string().optional(),
  minHours: z.coerce.number().int().positive().optional(),
  maxHours: z.coerce.number().int().positive().optional(),
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

export const insertBadgeSchema = createInsertSchema(badges).omit({
  id: true,
  createdAt: true,
});

export const insertBadgeAwardSchema = createInsertSchema(badgeAwards).omit({
  id: true,
  awardedAt: true,
});

export const insertCouponSchema = createInsertSchema(coupons).omit({
  id: true,
  createdAt: true,
  timesRedeemed: true,
}).extend({
  discountValue: z.coerce.string(),
  minBookingAmount: z.coerce.string().optional(),
  validUntil: z.coerce.date().optional(),
});

export const insertReferralRewardSchema = createInsertSchema(referralRewards).omit({
  id: true,
  createdAt: true,
  creditedAt: true,
  status: true,
});

export const insertBookingTransferSchema = createInsertSchema(bookingTransfers).omit({
  id: true,
  createdAt: true,
});

export const insertDriverAvailabilitySchema = createInsertSchema(driverAvailability).omit({
  id: true,
  createdAt: true,
}).extend({
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM 24h format"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM 24h format"),
});

export const insertDriverTimeOffSchema = createInsertSchema(driverTimeOff).omit({
  id: true,
  createdAt: true,
}).extend({
  type: z.enum(["vacation", "sick_leave", "other"]),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

export const insertCargoItemSchema = createInsertSchema(cargoItems).omit({
  id: true,
  createdAt: true,
  manuallyCorrected: true,
});

export const insertCallSchema = createInsertSchema(calls).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  connectedAt: true,
  endedAt: true,
  durationSeconds: true,
  quality: true,
  status: true,
}).extend({
  type: z.enum(["voice", "video"]),
});

export const insertVerificationDocumentSchema = createInsertSchema(verificationDocuments).omit({
  id: true,
  submittedAt: true,
  reviewedAt: true,
  reviewedBy: true,
  status: true,
}).extend({
  holderType: z.enum(["user", "driver", "company"]),
  docType: z.enum(["id_card", "selfie", "drivers_license", "company_registration", "insurance_certificate", "vehicle_registration"]),
  expiresAt: z.coerce.date().optional(),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  keyPrefix: true,
  keyHash: true,
  lastUsedAt: true,
  active: true,
  revokedAt: true,
});

export const insertWebhookSubscriptionSchema = createInsertSchema(webhookSubscriptions).omit({
  id: true,
  createdAt: true,
  secret: true,
  active: true,
}).extend({
  events: z.array(z.string()).min(1),
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

export type InsertBadge = z.infer<typeof insertBadgeSchema>;
export type Badge = typeof badges.$inferSelect;

export type InsertBadgeAward = z.infer<typeof insertBadgeAwardSchema>;
export type BadgeAward = typeof badgeAwards.$inferSelect;

export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type Coupon = typeof coupons.$inferSelect;

export type CouponRedemption = typeof couponRedemptions.$inferSelect;

export type InsertReferralReward = z.infer<typeof insertReferralRewardSchema>;
export type ReferralReward = typeof referralRewards.$inferSelect;

export type InsertBookingTransfer = z.infer<typeof insertBookingTransferSchema>;
export type BookingTransfer = typeof bookingTransfers.$inferSelect;

export type InsertDriverAvailability = z.infer<typeof insertDriverAvailabilitySchema>;
export type DriverAvailability = typeof driverAvailability.$inferSelect;

export type InsertDriverTimeOff = z.infer<typeof insertDriverTimeOffSchema>;
export type DriverTimeOff = typeof driverTimeOff.$inferSelect;

export type CalendarConnection = typeof calendarConnections.$inferSelect;

export type InsertCargoItem = z.infer<typeof insertCargoItemSchema>;
export type CargoItem = typeof cargoItems.$inferSelect;

export type MessageTranslation = typeof messageTranslations.$inferSelect;

export type InsertCall = z.infer<typeof insertCallSchema>;
export type Call = typeof calls.$inferSelect;

export type InsertVerificationDocument = z.infer<typeof insertVerificationDocumentSchema>;
export type VerificationDocument = typeof verificationDocuments.$inferSelect;

export type DeviceFingerprint = typeof deviceFingerprints.$inferSelect;
export type RiskScore = typeof riskScores.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;

export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;

export type InsertWebhookSubscription = z.infer<typeof insertWebhookSubscriptionSchema>;
export type WebhookSubscription = typeof webhookSubscriptions.$inferSelect;

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
