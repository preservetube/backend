const AWS = require('aws-sdk')
const fs = require('node:fs')

const keys = require('../s3.json')

async function uploadVideo(video) {
  const key = keys.videos[0]

  const s3 = new AWS.S3({
    accessKeyId: key.access,
    secretAccessKey: key.secret,
    endpoint: keys.endpoint,
    s3ForcePathStyle: true
  })

  const videoFile = fs.createReadStream(video)
  const uploaded = await s3.upload({
    Bucket: key.bucket,
    Key: video.split('/')[2],
    Body: videoFile,
    ContentType: 'video/mp4',
  }).promise()

  return uploaded.Location
}

async function uploadImage(id, url) {
  const key = keys.images[0]

  const s3 = new AWS.S3({
    accessKeyId: key.access,
    secretAccessKey: key.secret,
    endpoint: keys.endpoint,
    s3ForcePathStyle: true
  })

  const exists = await checkIfFileExists({
    Bucket: key.bucket,
    Key: `${id}.webp`
  }, s3)

  if (exists) {
    return `${key.url}${id}.webp`
  } else {
    const response = await fetch(url)
    const buffer = Buffer.from(await response.arrayBuffer())

    const uploaded = await s3.upload({
      Bucket: key.bucket,
      Key: `${id}.webp`,
      Body: buffer,
      ContentType: 'video/webp',
    }).promise()

    return uploaded.Location
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