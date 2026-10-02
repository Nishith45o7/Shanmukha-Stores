/**
 * FM-e / Shanmukha Stores - Google Authentication Client Handler
 * Non-intrusive handler: does not inject any extra DOM elements or disturb page layout.
 */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const googleBtns = document.querySelectorAll(
      "#googleLoginBtn, #googleLoginBtnAuth, #googleRegisterBtn, #googleRegisterBtnAuth, .google-auth-btn"
    );

    if (!googleBtns || googleBtns.length === 0) return;

    function getClientId() {
      if (window.GOOGLE_CLIENT_ID && window.GOOGLE_CLIENT_ID !== "your_google_client_id" && window.GOOGLE_CLIENT_ID.trim().length > 10) {
        return window.GOOGLE_CLIENT_ID.trim();
      }
      for (const btn of googleBtns) {
        const id = btn.getAttribute("data-client-id");
        if (id && id !== "your_google_client_id" && id.trim().length > 10) {
          return id.trim();
        }
      }
      return "";
    }

    const clientId = getClientId();
    let authCodeClient = null;

    // Only initialize GIS popup client if a real client ID is present
    if (clientId && typeof google !== "undefined" && google.accounts && google.accounts.oauth2) {
      try {
        authCodeClient = google.accounts.oauth2.initCodeClient({
          client_id: clientId,
          scope: "openid email profile",
          ux_mode: "popup",
          callback: async (response) => {
            if (response.error || !response.code) {
              console.error("[Google Auth] Error:", response);
              return;
            }
            try {
              let localCart = null;
              try { localCart = localStorage.getItem('shanmukha_guest_cart'); } catch (e) {}

              const res = await fetch("/auth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ code: response.code, local_cart: localCart }),
              });
              const data = await res.json();
              if (data && data.success) {
                try { localStorage.removeItem('shanmukha_guest_cart'); } catch (e) {}
                window.location.href = data.redirectUrl || "/";
              }
            } catch (err) {
              console.error("[Google Auth] Backend error:", err);
            }
          },
        });
      } catch (e) {
        console.error("[Google Auth] Init error:", e);
      }
    }

    googleBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        // If popup client is ready, use it; otherwise allow normal navigation to /auth/google
        if (authCodeClient) {
          e.preventDefault();
          authCodeClient.requestCode();
        }
      });
    });
  });
})();
