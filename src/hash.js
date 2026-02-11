const { createHash } = require('crypto')

function sha256(bufferOrString) {
  return createHash('sha256').update(bufferOrString).digest()
}

function doubleSha256Hex(bufferOrString) {
  return sha256(sha256(bufferOrString)).toString('hex')
}

function normalizeHex(hex) {
  return hex.startsWith('0x') ? hex.slice(2) : hex
}

function hexToBigInt(hex) {
  const normalized = normalizeHex(hex)

  if (!normalized) {
    return 0n
  }

  return BigInt(`0x${normalized}`)
}

function toUint32(value) {
  return Number(BigInt(value) & 0xffffffffn)
}

module.exports = {
  doubleSha256Hex,
  hexToBigInt,
  normalizeHex,
  toUint32,
}
