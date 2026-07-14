(function (window) {
  "use strict";

  var api = axios.create({
    baseURL: "https://easyiloners-4w68.vercel.app",
    timeout: 15000,
    headers: {
      "Content-Type": "application/json"
    }
  });

  function getErrorMessage(error, fallback) {
    if (error.response && error.response.data && error.response.data.error) {
      return error.response.data.error;
    }

    return error.message || fallback;
  }

  window.easyilonersApi = {
    submitLoanApplication: function (payload) {
      return api.post("/api/apply-loan", payload).then(function (response) {
        return response.data;
      }).catch(function (error) {
        throw new Error(getErrorMessage(error, "Unable to submit your loan application."));
      });
    },
    getLoanStatus: function (email) {
      return api.get("/api/apply-loan/status", {
        params: { email: email }
      }).then(function (response) {
        return response.data;
      }).catch(function (error) {
        throw new Error(getErrorMessage(error, "Unable to check loan application status."));
      });
    },
    getAllLoans: function () {
      return api.get("/api/apply-loan/all", {
        params: { limit: 25 }
      }).then(function (response) {
        return response.data;
      }).catch(function (error) {
        throw new Error(getErrorMessage(error, "Unable to load loan applications."));
      });
    }
  };
})(window);
