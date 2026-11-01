// Delivery config. (Non-AJAX endpoint on purpose: the /ajax one silently drops file attachments.) No secrets here: FormSubmit's random alias just hides the
// real mailbox address from page scrapers. It can be rotated any time.
window.FOODSNAP_CONFIG = {
  endpoint: "https://formsubmit.co/7decde3b78298ba5f37193062776eeab",
  subjectPrefix: "[FOOD-SNAP]",
  homeTimeZone: "Australia/Perth",
  maxEdge: 1600,
  jpegQuality: 0.82,
  maxPhotos: 6,
  maxPhotoBytes: 700000,   // per-photo cap; compressor lowers quality/size until under this (6 x 700 KB + voice stays well under FormSubmit's 10 MB)
  maxTotalBytes: 8000000,  // warn above this
  maxAudioSeconds: 120
};
