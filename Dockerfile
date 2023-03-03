FROM node:alpine

RUN mkdir -p /usr/src/preservetube/backend
WORKDIR /usr/src/preservetube/backend

COPY . /usr/src/preservetube/backend
RUN yarn

RUN wget https://github.com/ytdl-patched/yt-dlp/releases/download/2023.02.28.43044/yt-dlp -q
RUN chmod +x yt-dlp

CMD ["node", "index.js"]