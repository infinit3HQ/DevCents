// The Clerk issuer comes from the Convex deployment's environment, so each
// deployment (prod, dev, a self-hoster's server) trusts only its own Clerk
// instance. Set it before deploying:
//   npx convex env set CLERK_ISSUER_URL https://your-instance.clerk.accounts.dev
// Convex refuses to deploy while it is unset.
export default {
  providers: [
    {
      domain: process.env.CLERK_ISSUER_URL,
      applicationID: "convex",
    },
  ],
};
