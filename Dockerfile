FROM node:alpine

RUN apk add --no-cache python3 

RUN mkdir -p /usr/src/preservetube/backend
WORKDIR /usr/src/preservetube/backend

COPY . /usr/src/preservetube/backend
RUN yarn

CMD ["node", "index.js"]