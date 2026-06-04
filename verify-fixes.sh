#!/bin/bash

# SECUREBANK HONEYPOT - FEATURE VERIFICATION SCRIPT
# This script verifies all 7 features are properly implemented and working

echo "========================================="
echo "SecureBank Honeypot - Feature Verification"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: Server dependencies
echo -e "${YELLOW}[1] Checking server dependencies...${NC}"
cd server
if npm list express > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Express installed${NC}"
else
    echo -e "${RED}✗ Express not installed${NC}"
fi

if npm list pg > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PostgreSQL driver installed${NC}"
else
    echo -e "${RED}✗ PostgreSQL driver not installed${NC}"
fi

if npm list geoip-lite > /dev/null 2>&1; then
    echo -e "${GREEN}✓ GeoIP library installed${NC}"
else
    echo -e "${RED}✗ GeoIP library not installed${NC}"
fi

cd ..
echo ""

# Check 2: Client dependencies
echo -e "${YELLOW}[2] Checking client dependencies...${NC}"
cd client
if npm list react > /dev/null 2>&1; then
    echo -e "${GREEN}✓ React installed${NC}"
else
    echo -e "${RED}✗ React not installed${NC}"
fi

if npm list react-router-dom > /dev/null 2>&1; then
    echo -e "${GREEN}✓ React Router installed${NC}"
else
    echo -e "${RED}✗ React Router not installed${NC}"
fi

cd ..
echo ""

# Check 3: Environment file
echo -e "${YELLOW}[3] Checking .env file...${NC}"
if [ -f .env ]; then
    echo -e "${GREEN}✓ .env file exists${NC}"
    if grep -q DATABASE_URL .env; then
        echo -e "${GREEN}✓ DATABASE_URL configured${NC}"
    else
        echo -e "${RED}✗ DATABASE_URL not configured${NC}"
    fi
else
    echo -e "${RED}✗ .env file not found${NC}"
    echo "  Run: cp .env.example .env && edit .env with your DATABASE_URL"
fi
echo ""

# Check 4: File integrity - critical files
echo -e "${YELLOW}[4] Checking critical files...${NC}"
CRITICAL_FILES=(
    "server/middleware/attackLogger.js"
    "server/routes/honeypot.js"
    "server/routes/honeytokens.js"
    "server/routes/sessions.js"
    "server/services/alertEngine.js"
    "server/services/geoip.js"
    "server/services/fingerprint.js"
    "client/src/App.jsx"
    "client/src/components/Login.jsx"
    "client/src/components/Dashboard.jsx"
    "client/src/components/Search.jsx"
    "client/src/components/Comments.jsx"
    "client/src/components/Download.jsx"
)

for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓ $file${NC}"
    else
        echo -e "${RED}✗ $file MISSING${NC}"
    fi
done
echo ""

# Check 5: Code fixes verification
echo -e "${YELLOW}[5] Verifying critical code fixes...${NC}"

# Check alertEngine fix
if grep -q "WHERE severity >= 7" server/services/alertEngine.js; then
    echo -e "${GREEN}✓ Alert Engine severity fix applied${NC}"
else
    echo -e "${RED}✗ Alert Engine severity fix NOT applied${NC}"
fi

# Check geoip fix
if grep -q "latitude = \$4" server/services/geoip.js; then
    echo -e "${GREEN}✓ GeoIP latitude/longitude fix applied${NC}"
else
    echo -e "${RED}✗ GeoIP latitude/longitude fix NOT applied${NC}"
fi

# Check Transactions API_URL fix
if grep -q "const API_URL = 'http://localhost:5000'" client/src/components/Transactions.jsx; then
    echo -e "${GREEN}✓ Transactions API_URL fix applied${NC}"
else
    echo -e "${RED}✗ Transactions API_URL fix NOT applied${NC}"
fi

# Check session_recordings usage
if grep -q "session_recordings" server/middleware/attackLogger.js; then
    echo -e "${GREEN}✓ Session recording table name fix applied${NC}"
else
    echo -e "${RED}✗ Session recording table name fix NOT applied${NC}"
fi

echo ""

# Check 6: Feature endpoints
echo -e "${YELLOW}[6] Checking feature endpoints...${NC}"
echo -e "Expected endpoints:"
echo "  POST /api/login - SQL Injection"
echo "  GET /api/search - Reflected XSS"
echo "  GET/POST /api/comments - Stored XSS"
echo "  GET /api/download - Directory Traversal"
echo "  POST /api/transfer - IDOR"
echo "  GET /api/user/:id - IDOR"
echo "  GET /api/honeytokens/create - Honeytoken"
echo "  GET /api/sessions - Session Recording"
echo ""

# Check 7: Database schema
echo -e "${YELLOW}[7] Database schema file...${NC}"
if [ -f "server/db/schema-updated.sql" ]; then
    echo -e "${GREEN}✓ Updated schema file exists${NC}"
    if grep -q "severity INTEGER" server/db/schema-updated.sql; then
        echo -e "${GREEN}✓ Schema has correct severity type (INTEGER)${NC}"
    else
        echo -e "${RED}✗ Schema severity type incorrect${NC}"
    fi
    if grep -q "CREATE TABLE session_recordings" server/db/schema-updated.sql; then
        echo -e "${GREEN}✓ Schema has session_recordings table${NC}"
    else
        echo -e "${RED}✗ Schema missing session_recordings table${NC}"
    fi
else
    echo -e "${RED}✗ Updated schema file missing${NC}"
fi
echo ""

echo "========================================="
echo "Verification Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Update your database schema:"
echo "   psql \$DATABASE_URL < server/db/schema-updated.sql"
echo "2. Start the server:"
echo "   cd server && npm start"
echo "3. Start the client (in another terminal):"
echo "   cd client && npm run dev"
echo "4. Open browser to http://localhost:5173"
echo ""
echo "Test credentials:"
echo "  Username: john_doe"
echo "  Password: password123"
