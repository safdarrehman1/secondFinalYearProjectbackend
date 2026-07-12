jest.mock("resend", () => {
  return {
    Resend: class Resend {
      constructor() {
        this.emails = {
          send: jest.fn().mockResolvedValue(true),
        };
      }
    },
  };
});

jest.mock("axios", () => ({
  create: () => ({
    get: jest.fn(),
    post: jest.fn(),
  }),
  get: jest.fn(),
  post: jest.fn(),
}));

// Also mock other external payment APIs globally to be safe
jest.mock("square", () => ({
  SquareClient: class {},
  SquareEnvironment: { Sandbox: "sandbox", Production: "production" },
}));
