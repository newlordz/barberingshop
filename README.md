# Barber Shop Sales App

A full-stack sales app for a barbering shop: record customers seen by each barber, services rendered, and monitor progress. Admins manage barbers, services, and users; barbers (or staff) record visits.

## Features

- **Record visits**: Barber, customer (search or create new), date, and multiple services per visit
- **Visits list**: Filter by date range and (for admins) by barber
- **Reports**: Total visits, revenue, sales by barber, revenue by service (date filter)
- **Admin only**: Add/remove barbers, add/remove services, add barber logins, view reports
- **Barber logins**: Barbers can be linked to a barber profile; they only record visits for themselves

## Tech

- **Backend**: Node.js, Express, SQLite (better-sqlite3), bcryptjs, express-session
- **Frontend**: Vanilla HTML/CSS/JS, single-page app with hash routing
- **Database**: SQLite file at `data/barber.db`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Initialize the database (creates `data/barber.db` and seed data):
   ```bash
   npm run init-db
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open **http://localhost:3000** in your browser.

## Default login

- **Username**: `admin`
- **Password**: `admin123`

Change the password in production (e.g. by updating the user in the database with a new bcrypt hash).

## Admin tasks

- **Barbers**: Add/remove barber names (used when recording visits and in reports).
- **Services**: Add/remove services with names and prices.
- **Users**: Create barber logins; optionally link each user to a barber so they only record visits for themselves.
- **Reports**: Use date range to see visits, revenue, by-barber and by-service breakdown.

## Recording a visit

1. Go to **Record visit**.
2. Select barber (admins choose; barbers are fixed to their profile).
3. Type customer name to search or create a new customer.
4. Add one or more services (quantity and price come from the service list).
5. Save. The visit appears in **Visits** and in **Reports**.
