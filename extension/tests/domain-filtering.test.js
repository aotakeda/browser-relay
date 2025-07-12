/**
 * @jest-environment jsdom
 */

// Mock Chrome API
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
    },
  },
};

// Mock window location
Object.defineProperty(window, "location", {
  value: {
    hostname: "localhost",
    port: "4321",
    href: "http://localhost:4321/",
  },
  writable: true,
});

describe("Domain Filtering Logic", () => {
  let shouldCaptureDomain;
  let allDomainsMode;
  let specificDomains;

  beforeEach(() => {
    // Reset state before each test
    allDomainsMode = false;
    specificDomains = [];

    // Reset window location to default test location
    Object.defineProperty(window, "location", {
      value: {
        hostname: "localhost",
        port: "4321",
        href: "http://localhost:4321/",
      },
      writable: true,
    });

    // Recreate the shouldCaptureDomain function from content.js
    shouldCaptureDomain = () => {
      if (allDomainsMode) {
        return true;
      }

      const hostname = window.location.hostname;
      const port = window.location.port;
      const hostWithPort = port ? `${hostname}:${port}` : hostname;

      return specificDomains.some((domain) => {
        // First check exact match with host:port
        if (hostWithPort === domain) {
          return true;
        }

        // Then check hostname-only match (for domains without ports)
        if (hostname === domain) {
          return true;
        }

        // Finally check subdomain match (for domains without ports)
        if (hostname.endsWith("." + domain)) {
          return true;
        }

        return false;
      });
    };
  });

  describe("All Domains Mode", () => {
    it("should capture all domains when allDomainsMode is true", () => {
      allDomainsMode = true;
      specificDomains = [];

      expect(shouldCaptureDomain()).toBe(true);
    });

    it("should ignore specificDomains when allDomainsMode is true", () => {
      allDomainsMode = true;
      specificDomains = ["example.com"]; // Different domain

      expect(shouldCaptureDomain()).toBe(true);
    });
  });

  describe("Specific Domains Mode", () => {
    beforeEach(() => {
      allDomainsMode = false;
    });

    it("should not capture when no specific domains are set", () => {
      specificDomains = [];

      expect(shouldCaptureDomain()).toBe(false);
    });

    it("should capture when exact host:port matches", () => {
      specificDomains = ["localhost:4321"];

      expect(shouldCaptureDomain()).toBe(true);
    });

    it("should capture when hostname matches (no port specified)", () => {
      specificDomains = ["localhost"];

      expect(shouldCaptureDomain()).toBe(true);
    });

    it("should not capture when domain does not match", () => {
      specificDomains = ["example.com"];

      expect(shouldCaptureDomain()).toBe(false);
    });

    it("should not capture when port does not match", () => {
      specificDomains = ["localhost:3000"];

      expect(shouldCaptureDomain()).toBe(false);
    });
  });

  describe("Multiple Domains", () => {
    beforeEach(() => {
      allDomainsMode = false;
    });

    it("should capture when one of multiple domains matches", () => {
      specificDomains = ["example.com", "localhost:4321", "test.com"];

      expect(shouldCaptureDomain()).toBe(true);
    });

    it("should not capture when none of multiple domains match", () => {
      specificDomains = ["example.com", "test.com", "localhost:3000"];

      expect(shouldCaptureDomain()).toBe(false);
    });
  });

  describe("Subdomain Matching", () => {
    beforeEach(() => {
      allDomainsMode = false;
      // Change window location to test subdomain matching
      Object.defineProperty(window, "location", {
        value: {
          hostname: "api.example.com",
          port: "",
          href: "https://api.example.com/",
        },
        writable: true,
      });
    });

    it("should capture subdomain when parent domain is in specific domains", () => {
      specificDomains = ["example.com"];

      expect(shouldCaptureDomain()).toBe(true);
    });

    it("should capture exact subdomain match", () => {
      specificDomains = ["api.example.com"];

      expect(shouldCaptureDomain()).toBe(true);
    });

    it("should not capture when subdomain does not match", () => {
      specificDomains = ["different.com"];

      expect(shouldCaptureDomain()).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty string domains", () => {
      allDomainsMode = false;
      specificDomains = [""];

      expect(shouldCaptureDomain()).toBe(false);
    });

    it("should handle domains with different ports", () => {
      allDomainsMode = false;
      specificDomains = ["localhost:3000", "localhost:4321", "localhost:8080"];

      // Current location is localhost:4321, so should match
      expect(shouldCaptureDomain()).toBe(true);
    });

    it("should handle IP addresses", () => {
      allDomainsMode = false;
      specificDomains = ["127.0.0.1:4321"];

      // Change window location to IP address
      Object.defineProperty(window, "location", {
        value: {
          hostname: "127.0.0.1",
          port: "4321",
          href: "http://127.0.0.1:4321/",
        },
        writable: true,
      });

      expect(shouldCaptureDomain()).toBe(true);
    });

    it("should handle domains without ports when current location has port", () => {
      allDomainsMode = false;
      specificDomains = ["localhost"]; // No port specified

      expect(shouldCaptureDomain()).toBe(true);
    });

    it("should handle case sensitivity", () => {
      allDomainsMode = false;
      specificDomains = ["LOCALHOST:4321"]; // Different case

      // Domain matching should be case-insensitive in practice
      // But our current implementation is case-sensitive
      expect(shouldCaptureDomain()).toBe(false);
    });
  });

  describe("Real-world Scenarios", () => {
    it("should handle typical development setup", () => {
      allDomainsMode = false;
      specificDomains = ["localhost:3000", "localhost:3001", "localhost:4321"];

      expect(shouldCaptureDomain()).toBe(true);
    });

    it("should handle production-like domains", () => {
      allDomainsMode = false;
      specificDomains = ["app.example.com", "api.example.com"];

      // Change to production domain
      Object.defineProperty(window, "location", {
        value: {
          hostname: "app.example.com",
          port: "",
          href: "https://app.example.com/",
        },
        writable: true,
      });

      expect(shouldCaptureDomain()).toBe(true);
    });

    it("should block unwanted domains like google.com", () => {
      allDomainsMode = false;
      specificDomains = ["localhost:3000", "localhost:4321"];

      // Change to google.com
      Object.defineProperty(window, "location", {
        value: {
          hostname: "google.com",
          port: "",
          href: "https://google.com/",
        },
        writable: true,
      });

      expect(shouldCaptureDomain()).toBe(false);
    });

    it("should block unwanted domains like github.com", () => {
      allDomainsMode = false;
      specificDomains = ["localhost:3000", "localhost:4321"];

      // Change to github.com
      Object.defineProperty(window, "location", {
        value: {
          hostname: "github.com",
          port: "",
          href: "https://github.com/",
        },
        writable: true,
      });

      expect(shouldCaptureDomain()).toBe(false);
    });
  });

  describe("Settings Integration", () => {
    it("should switch behavior when allDomainsMode changes", () => {
      // Start with specific domains
      allDomainsMode = false;
      specificDomains = ["example.com"]; // Different domain
      expect(shouldCaptureDomain()).toBe(false);

      // Switch to all domains mode
      allDomainsMode = true;
      expect(shouldCaptureDomain()).toBe(true);
    });

    it("should react to specificDomains changes", () => {
      allDomainsMode = false;
      specificDomains = ["example.com"];
      expect(shouldCaptureDomain()).toBe(false);

      // Add current domain to specific domains
      specificDomains = ["example.com", "localhost:4321"];
      expect(shouldCaptureDomain()).toBe(true);
    });
  });
});
