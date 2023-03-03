const AWS = require('aws-sdk')
const fs = require('node:fs')

const keys = require('../s3.json')

async function uploadVideo(video) {
  const items = keys.videos
  const key = items[Math.floor(Math.random() * items.length)]

  const s3 = new AWS.S3({
    accessKeyId: key.access,
    secretAccessKey: key.secret,
    endpoint: 'https://gateway.storjshare.io'
  })

  const videoFile = fs.readFileSync(video)
  await s3.upload({
    Bucket: 'video',
    Key: video.split('/')[2],
    Body: videoFile,
    ContentType: 'video/webm',
  }).promise()

  return `${key.url}${video.split('/')[2]}`
}

async function uploadImage(id, url) {
  const items = keys.images
  const key = items[Math.floor(Math.random() * items.length)]

  const s3 = new AWS.S3({
    accessKeyId: key.access,
    secretAccessKey: key.secret,
    endpoint: 'https://gateway.storjshare.io'
  })

  const exists = await checkIfFileExists({
    Bucket: 'media', 
    Key: `${id}.webp`
  }, s3)
  
  if (exists) {
    return `${key.url}${id}.webp`
  } else {
    const response = await fetch(url)
    const buffer = Buffer.from(await response.arrayBuffer())

    await s3.upload({
      Bucket: 'media',
      Key: `${id}.webp`,
      Body: buffer,
      ContentType: 'video/webp',
    }).promise()

    return `${key.url}${id}.webp`
  }
}

async function checkIfFileExists(params, s3) {
  try {
    await s3.headObject(params).promise()
    return true
  } catch (err) {
    return false
  }
}

module.exports = { uploadVideo, uploadImage }