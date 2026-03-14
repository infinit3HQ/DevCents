export default {
  providers: [
    {
      domain: process.env.CLERK_ISSUER_URL || "https://clerk.devcents.012140.xyz",
      applicationID: "convex",
    },
  ],
};
