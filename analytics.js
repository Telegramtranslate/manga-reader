/**
 * Vercel Web Analytics initialization
 * This file injects the Vercel Analytics script for tracking page views and custom events.
 * Documentation: https://vercel.com/docs/analytics/quickstart
 */

(function() {
  'use strict';
  
  // Vercel Web Analytics initialization
  // The analytics script will be injected dynamically and will:
  // - Track page views automatically
  // - Only send data in production (not in development)
  // - Provide privacy-friendly analytics
  
  // Create the analytics queue if it doesn't exist
  window.va = window.va || function() {
    (window.vaq = window.vaq || []).push(arguments);
  };
  
  // Load the Vercel Analytics script
  var script = document.createElement('script');
  script.defer = true;
  script.src = 'https://cdn.vercel-insights.com/v1/script.js';
  
  // Append the script to the document head
  var firstScript = document.getElementsByTagName('script')[0];
  if (firstScript && firstScript.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    document.head.appendChild(script);
  }
})();
