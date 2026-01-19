# Autumn SDK Migration Plan

Migrate `src/convex/usage.ts` from raw HTTP API calls to the `autumn-js` TypeScript SDK.

## Current State

The code uses **raw HTTP fetch calls** to `https://api.autumn.com/v1/...` for:

- Customer management (create/get)
- Feature usage checking
- Usage tracking
- Checkout session creation
- Product attachment
- Billing portal session creation

## Target State

Use the **`autumn-js` SDK** (already installed: `"autumn-js": "^0.1.69"`) which provides typed methods for all operations.

## Items to Refactor

### 1. Client Initialization (New)

**Current:** No client - manually constructs headers with `AUTUMN_SECRET_KEY` for each request

**Target:**

```typescript
import { Autumn } from 'autumn-js';

const autumn = new Autumn({
	secretKey: process.env.AUTUMN_SECRET_KEY
});
```

### 2. `getOrCreateCustomer()` (Lines 109-177)

**Current:** Two raw fetch calls:

- `POST https://api.autumn.com/v1/customers` (create)
- `GET https://api.autumn.com/v1/customers/${customerId}?expand=payment_method` (fetch)

**Target:**

```typescript
await autumn.customers.create({ id, email, name });
await autumn.customers.get(customerId, { expand: ['payment_method'] });
```

### 3. `checkFeature()` (Lines 191-228)

**Current:** Raw fetch to `POST https://api.autumn.com/v1/check`

**Target:**

```typescript
await autumn.check({
	customer_id: args.customerId,
	feature_id: args.featureId,
	required_balance: args.requiredBalance
});
```

### 4. `trackUsage()` (Lines 230-253)

**Current:** Raw fetch to `POST https://api.autumn.com/v1/track`

**Target:**

```typescript
await autumn.track({
	customer_id: args.customerId,
	feature_id: args.featureId,
	value: args.value
});
```

### 5. `createCheckoutSession` (Lines 450-516)

**Current:** Two raw fetch calls:

- `POST https://api.autumn.com/v1/checkout`
- `POST https://api.autumn.com/v1/attach` (fallback)

**Target:**

```typescript
const result = await autumn.checkout({
	customer_id: customerId,
	product_id: 'btca_pro',
	success_url: `${baseUrl}/checkout/success`,
	checkout_session_params: { cancel_url: `${baseUrl}/checkout/cancel` }
});

// Fallback
const attachResult = await autumn.attach({
	customer_id: customerId,
	product_id: 'btca_pro',
	success_url: `${baseUrl}/checkout/success`
});
```

### 6. `createBillingPortalSession` (Lines 519-558)

**Current:** Raw fetch to `POST https://api.autumn.com/v1/customers/${customerId}/billing_portal`

**Target:**

```typescript
await autumn.customers.billingPortal(customerId, {
	return_url: `${baseUrl}/settings/billing`
});
```

## Types to Remove

These custom types can be replaced with SDK types:

- `AutumnResult` (lines 70-73)
- `UsageMetric` (lines 64-68)
- Inline types in `getOrCreateCustomer`

## Migration Checklist

| Item                     | Location                              | SDK Method                         | Status |
| ------------------------ | ------------------------------------- | ---------------------------------- | ------ |
| Initialize Autumn client | N/A (new)                             | `new Autumn({ secretKey })`        | ⬜     |
| Create customer          | `getOrCreateCustomer()` L124-132      | `autumn.customers.create()`        | ⬜     |
| Get customer             | `getOrCreateCustomer()` L140-163      | `autumn.customers.get()`           | ⬜     |
| Check feature usage      | `checkFeature()` L191-228             | `autumn.check()`                   | ⬜     |
| Track usage              | `trackUsage()` L230-253               | `autumn.track()`                   | ⬜     |
| Create checkout          | `createCheckoutSession` L465-489      | `autumn.checkout()`                | ⬜     |
| Attach product           | `createCheckoutSession` L492-514      | `autumn.attach()`                  | ⬜     |
| Billing portal           | `createBillingPortalSession` L533-549 | `autumn.customers.billingPortal()` | ⬜     |

## Considerations

1. **Response Shape**: SDK's `check()` returns `{ allowed, ... }` - verify full response shape matches current expectations for `{ usage, balance, included_usage }`

2. **Error Handling**: SDK returns `{ data, error }` pattern similar to current manual parsing

3. **Convex Compatibility**: Verify SDK works in Convex actions (should be fine since they support standard Node.js APIs)

4. **Testing**: Test each refactored function to ensure billing/usage tracking works correctly
