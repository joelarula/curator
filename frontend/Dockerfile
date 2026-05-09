# --- Build Stage ---
FROM node:20-slim AS build-stage

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
# Note: Ensure VITE_API_URL is passed during build if you want to hardcode it, 
# otherwise use runtime environment variables if supported by your setup.
RUN npm run build

# --- Production Stage ---
FROM nginx:stable-alpine AS production-stage

COPY --from=build-stage /app/dist /usr/share/nginx/html

# Add custom nginx config to handle SPA routing and API proxying
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
