"""
App-wide constants for Meck-Grade.
"""

# --- DPI / Resolution ---
WORKING_DPI = 600           # Internal working resolution for all analysis
MIN_DPI_WARNING = 300       # Warn user if scan appears to be below this

# Standard TCG card dimensions in inches (Pokemon, MTG, Yu-Gi-Oh, etc.)
CARD_WIDTH_IN  = 2.5
CARD_HEIGHT_IN = 3.5
CARD_ASPECT_RATIO = CARD_HEIGHT_IN / CARD_WIDTH_IN   # ~1.4

# Physical dimensions in millimetres (used for px-per-mm calibration)
CARD_WIDTH_MM  = 63.0
CARD_HEIGHT_MM = 88.0

# Tolerance when detecting card contour aspect ratio (±)
ASPECT_RATIO_TOLERANCE = 0.15

# --- Detection v2 (smartphone- and scanner-capable) ---
# Long side (in pixels) the input image is resized to before detection.
# Lower = faster, higher = more precise. 1500 is a good trade-off.
DETECT_LONG_SIDE          = 1500
# Best-effort policy: detection ALWAYS returns a quad if any plausible
# foreground was found.  Gates below only feed into a confidence score and
# trigger a low-confidence warning — they don't reject the result, since
# the user can fine-tune the outer edges in the centering editor.
DETECT_MIN_CARD_AREA_FRAC = 0.05   # below this → low confidence
DETECT_ASPECT_TOLERANCE   = 0.20   # warped aspect must be 1.4 ± this for full conf
DETECT_SOLIDITY_MIN       = 0.85   # mask solidity (area / convex hull area)
EDGE_REFINE_STRIPS        = 30     # number of perpendicular gradient strips per side
EDGE_REFINE_BAND          = 0.06   # search band width as fraction of card short side

# --- Centering thresholds (expressed as the LARGER side / total border) ---
# e.g. 0.55 means 55% of the border is on the larger side (55/45 split)
PSA_10_CENTERING_FRONT = 0.55   # PSA Gem Mint front requirement
PSA_10_CENTERING_BACK  = 0.75   # PSA Gem Mint back requirement
PSA_9_CENTERING_FRONT  = 0.60
PSA_9_CENTERING_BACK   = 0.80

# --- Region proportions (as fraction of card dimension) ---
CORNER_REGION_SIZE  = 0.08   # Square corner crop = 8% of card width
EDGE_STRIP_WIDTH    = 0.05   # Edge strip thickness = 5% of relevant dimension
SURFACE_INSET       = 0.08   # Surface analysis inset from each edge

# --- Grading score thresholds (0-100 raw subscores) ---
GEM_MINT_THRESHOLD  = 95
MINT_THRESHOLD      = 85
NM_MT_THRESHOLD     = 75
NM_THRESHOLD        = 65
EX_MT_THRESHOLD     = 55
EX_THRESHOLD        = 45
VG_EX_THRESHOLD     = 35
VG_THRESHOLD        = 25
GOOD_THRESHOLD      = 15

# --- Grading composite weights ---
WEIGHT_CENTERING = 0.25
WEIGHT_CORNERS   = 0.30
WEIGHT_EDGES     = 0.25
WEIGHT_SURFACE   = 0.20

# --- Surface analysis parameters ---
CLAHE_CLIP_LIMIT  = 3.0
CLAHE_TILE_SIZE   = (8, 8)
SCRATCH_THRESHOLD = 50      # Pixels above this intensity in CLAHE result = scratch candidate
LAPLACIAN_THRESHOLD = 30    # Laplacian magnitude threshold for dent detection
MIN_DENT_AREA     = 20      # Minimum pixel area for a dent cluster to count
HOLO_LBP_RADIUS   = 3
HOLO_LBP_POINTS   = 24

# Grading service submission URLs
GRADING_LINKS = {
    "PSA":     "https://www.psacard.com/submissions",
    "BGS":     "https://www.beckett.com/grading",
    "CGC":     "https://www.cgccards.com/submit/",
    "TAG":     "https://taggrading.com/submit",
}

# Allowed upload MIME types
ALLOWED_MIMETYPES = {
    "image/jpeg", "image/jpg", "image/png", "image/tiff",
    "image/tif", "image/x-tiff",
}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}

MAX_UPLOAD_MB = 80   # Max file size per image
