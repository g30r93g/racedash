// Global test setup — sets env vars needed by lazy-initialized modules

process.env.STRIPE_PRICE_PLUS ??= 'price_test_plus'
process.env.STRIPE_PRICE_PRO ??= 'price_test_pro'
process.env.STRIPE_PRICE_CREDITS_50 ??= 'price_test_credits_50'
process.env.STRIPE_PRICE_CREDITS_100 ??= 'price_test_credits_100'
process.env.STRIPE_PRICE_CREDITS_250 ??= 'price_test_credits_250'
process.env.STRIPE_PRICE_CREDITS_500 ??= 'price_test_credits_500'
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_test_secret'
