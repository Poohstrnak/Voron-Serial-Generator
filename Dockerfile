FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html app.js plate.js preview.png favicon.ico robots.txt *.stl /usr/share/nginx/html/
COPY fonts /usr/share/nginx/html/fonts
