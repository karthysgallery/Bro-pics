export * from './schemas/product';
export * from './schemas/variant';
export * from './schemas/coupon';
export * from './schemas/order';
export * from './schemas/order-event';
export * from './schemas/order-item';
export * from './schemas/customization';
export * from './schemas/settings';
export * from './schemas/category';
export * from './schemas/collection';
export * from './schemas/review';
export * from './schemas/product-media';
export * from './schemas/media-asset';
export * from './schemas/homepage-section';
export * from './schemas/upload';
export * from './schemas/frame-template';
export * from './schemas/user';
export * from './schemas/address';
export * from './schemas/return';
export * from './schemas/return-event';
export * from './schemas/notification';
export * from './schemas/notification-outbox';
export * from './schemas/print-job';
export * from './search/types';
export * from './search/build-query-plan';
export * from './search/search-products';
export * from './search/search-provider';
export * from './search/parse-search-params';
export * from './search/product-search-fields';
export * from './pricing/money';
export * from './pricing/coupon';
export * from './pricing/gst';
export * from './pricing/coupon-eligibility';
export * from './dpi/calculate';
export * from './dpi/derive-print-pixels';
export * from './cart/merge-cart-items';
export * from './orders/order-number';
export * from './orders/invoice-number';
export * from './orders/status-transitions';
export * from './orders/order-status-event';
export * from './orders/return-status-transitions';
export * from './editor-geometry';
export * from './shipping/shipping-provider';
export * from './shipping/pincode-zones';
export * from './print-jobs/backoff';
// print-jobs/print-jobs.ts is deliberately NOT re-exported from this
// barrel — see its own top-of-file comment. A real (non-type) import of
// firebase-admin/firestore anywhere in a module this barrel exports gets
// pulled into EVERY consumer's bundle, including client components (this
// broke the whole site's client bundle once a client component imported
// anything from this package — cart-context.tsx did, via mergeCartItems
// — discovered live via preview_start while testing BE-34, not by
// typecheck or the test suite, neither of which catches bundler-level
// module resolution). Server-only callers import it directly by path:
// '@bro-pics/shared/src/print-jobs/print-jobs'.
export * from './notifications/notification-outbox';
export * from './reconciliation/stuck-orders';
export * from './cleanup/stale-anonymous-docs';
export * from './logging/logger';
export * from './auth/permissions';
export * from './schemas/staff-mirror';
