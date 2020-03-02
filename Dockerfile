FROM node:alpine

RUN mkdir /mqtt
RUN mkdir /mqtt/config
WORKDIR /mqtt

ADD package.json /mqtt/
RUN npm install

COPY mqtttplinkbridge.js /mqtt

ADD ./config.json /mqtt/config/
ADD VERSION .
ADD Dockerfile .
ADD build_container.sh .

CMD [ "npm", "start" ]
