FROM node:alpine

RUN apk add --no-cache python3 

RUN mkdir -p /usr/src/preservetube/backend
WORKDIR /usr/src/preservetube/backend

COPY . /usr/src/preservetube/backend
RUN yarn

RUN wget https://github.com/yt-dlp/yt-dlp/releases/download/2023.12.30/yt-dlp -q
RUN chmod +x yt-dlp

CMD ["node", "index.js"]