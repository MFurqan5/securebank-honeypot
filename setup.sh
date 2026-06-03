#!/bin/bash

echo "========================================"
echo "SecureBank Honeypot - Setup Script"
echo "========================================"
echo ""

echo "Step 1: Installing server dependencies..."
cd server
npm install
if [ $? -ne 0 ]; then
    echo "Error installing server dependencies"
    exit 1
fi
echo "✓ Server dependencies installed"

echo ""
echo "Step 2: Creating .env file..."
if [ ! -f .env ]; then
    cat > .env << 'EOF'
DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-your-endpoint.us-east-1.neon.tech/neondb?sslmode=require
HONEYPOT_PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
EOF
    echo "✓ .env file created"
    echo ""
    echo "Please update the DATABASE_URL in server/.env with your Neon.tech credentials!"
else
    echo "✓ .env file already exists"
fi

echo ""
echo "Step 3: Installing client dependencies..."
cd ../client
npm install
if [ $? -ne 0 ]; then
    echo "Error installing client dependencies"
    exit 1
fi
echo "✓ Client dependencies installed"

echo ""
echo "========================================"
echo "✅ Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Edit server/.env with your Neon.tech connection string:"
echo "   DATABASE_URL=postgresql://neondb_owner:PASSWORD@endpoint/neondb?sslmode=require"
echo ""
echo "2. Initialize the database:"
echo "   cd server"
echo "   npm run init-db"
echo ""
echo "3. In terminal 1, start the server:"
echo "   cd server"
echo "   npm run dev"
echo ""
echo "4. In terminal 2, start the client:"
echo "   cd client"
echo "   npm run dev"
echo ""
echo "5. Open http://localhost:5173 and login with:"
echo "   Username: admin   Password: admin"
echo ""
