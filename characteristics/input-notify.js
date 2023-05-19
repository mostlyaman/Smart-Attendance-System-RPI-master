const execSync = require('child_process').execSync
const exec = require('child_process').exec
let util = require('util')
let bleno = require('bleno')
let UUID = require('../sugar-uuid')
let config = require('../config')
const fs = require('fs')
const conf_path = '/etc/wpa_supplicant/wpa_supplicant.conf'
const iface_path = '/etc/network/interfaces'
const concatTag = '%&%'
const endTag = '&#&'

const fetch = require("node-fetch");
const camera_config = require('../camera_config.json');
let argv = process.argv
if (argv.length > 2) config.key = process.argv[2]

let BlenoCharacteristic = bleno.Characteristic
let message = ''
let messageTimestamp = 0

// Input

let InputCharacteristic = function() {
  InputCharacteristic.super_.call(this, {
    uuid: UUID.INPUT,
    properties: ['write', 'writeWithoutResponse']
  })
}

util.inherits(InputCharacteristic, BlenoCharacteristic)

InputCharacteristic.prototype.onWriteRequest = function(data, offset, withoutResponse, callback) {
  console.log('InputCharacteristic write request: ' + data.toString() + ' ' + offset + ' ' + withoutResponse)
  let inputArray = data.toString().split(concatTag)
  if (inputArray && inputArray.length < 3) {
    console.log('Wrong input syntax.')
    setMessage('Wrong input syntax.')
    callback(this.RESULT_SUCCESS)
    return
  }
  if (inputArray[0] !== config.key){
    console.log('Wrong input key.')
    setMessage('Wrong input key.')
    callback(this.RESULT_SUCCESS)
    return
  }
  let ssid = inputArray[1]
  let password = inputArray[2]
  let result = setWifi(ssid, password)
  callback(this.RESULT_SUCCESS)
}


// Input android

let separateInputString = ''
let separateInputStringCopy = ''
let lastChangeTime = 0
let clearTime = 5000

setInterval(function () {
  if (separateInputStringCopy !== separateInputString) {
    separateInputStringCopy = separateInputString
    lastChangeTime = new Date().getTime()
  } else if (new Date().getTime() - lastChangeTime > clearTime && separateInputString !== '') {
    lastChangeTime = new Date().getTime()
    separateInputStringCopy = ''
    separateInputString = ''
    console.log('clear separateInputString')
  }
}, 1000)

let InputCharacteristicSep = function() {
  InputCharacteristicSep.super_.call(this, {
    uuid: UUID.INPUT_SEP,
    properties: ['write', 'writeWithoutResponse']
  })
}

util.inherits(InputCharacteristicSep, BlenoCharacteristic)

InputCharacteristicSep.prototype.onWriteRequest = function(data, offset, withoutResponse, callback) {
  console.log('InputCharacteristicSep write request: ' + data.toString() + ' ' + offset + ' ' + withoutResponse)
  separateInputString += data.toString()
  let isLast = separateInputString.indexOf(endTag) >= 0
  if (isLast) {
    separateInputString = separateInputString.replace(endTag, '')
    let inputArray = separateInputString.split(concatTag)
    lastChangeTime = new Date().getTime()
    separateInputStringCopy = ''
    separateInputString = ''
    if (inputArray && inputArray.length < 3) {
      console.log('Invalid syntax.')
      setMessage('Invalid syntax.')
      callback(this.RESULT_SUCCESS)
      return
    }
    if (inputArray[0] !== config.key){
      console.log('Invalid key.')
      setMessage('Invalid key.')
      callback(this.RESULT_SUCCESS)
      return
    }
    let ssid = inputArray[1]
    let password = inputArray[2]
    let result = setWifi(ssid, password)
  }
  callback(this.RESULT_SUCCESS)
}


// NotifyMassage

let NotifyMassageCharacteristic = function() {
  NotifyMassageCharacteristic.super_.call(this, {
    uuid: UUID.NOTIFY_MESSAGE,
    properties: ['notify']
  })
}

util.inherits(NotifyMassageCharacteristic, BlenoCharacteristic)

NotifyMassageCharacteristic.prototype.onSubscribe = function(maxValueSize, updateValueCallback) {
  console.log('NotifyMassageCharacteristic subscribe')
  this.timeStamp = messageTimestamp
  this.changeInterval = setInterval(function() {
    if (this.timeStamp === messageTimestamp) return
    let data = new Buffer(message)
    console.log('NotifyMassageCharacteristic update value: ' + message)
    updateValueCallback(data)
    this.timeStamp = messageTimestamp
  }.bind(this), 100)
}

NotifyMassageCharacteristic.prototype.onUnsubscribe = function() {
  console.log('NotifyMassageCharacteristic unsubscribe')

  if (this.changeInterval) {
    clearInterval(this.changeInterval)
    this.changeInterval = null
  }
}

NotifyMassageCharacteristic.prototype.onNotify = function() {
  console.log('NotifyMassageCharacteristic on notify')
}

async function setWifi (input_ssid, input_password) {
  console.log(`${input_ssid} ${input_password}`)
  bt_data = JSON.parse(input_ssid);
  let data = {};
  data.course = bt_data.course;
  
  camera_config.cameras.forEach(async (camera) => {
    // Check camera server status
    camera_status = await fetch(camera.ping).then(async (res) => await res.json()).catch(err => {return {status: err.toString()}})
    // Get image
    if(camera_status.status == 'ok') {
      data[camera.device] = {status: 'ok', image: await fetch(camera.capture).then(async (res) => await res.text())}
    } else {
      data[camera.device] = {status: camera_status.status, image: null}
    }

  });

  // Delete old photo
  fs.stat('/home/pi/Smart-Attendance-System-RPI-master/temp.jpg', function (err, stats) {
 
    if (!err) {    
      fs.unlink('/home/pi/Smart-Attendance-System-RPI-master/temp.jpg', function(err){
          if(err) return console.error(err);
      });  
    } 

    // Capture New Image
    exec("/usr/bin/python /home/pi/Smart-Attendance-System-RPI-master/capture_image.py", (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`)
        return
      }
  
      // Check if new photo was successfully taken
      fs.stat('/home/pi/Smart-Attendance-System-RPI-master/temp.jpg', async function (err, stats) {
   
        if (err) {
            data.master = {status : 'ok', image: null}
            console.error(err);
        } else {
          data.master = {status: 'ok', image: fs.readFileSync('/home/pi/Smart-Attendance-System-RPI-master/temp.jpg', 'base64')};
        }

        // Store Data Locally
        // console.log(data)
	console.log(data.course)
        await fetch(camera_config.api, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data)
        })
          .then(async (res) => {
            if(res.status != 200) console.error(await res.text()); 
            console.log("Done serving Bluetooth Request - ", res.status);          
          })
          .catch(err => console.error(err));

        // fs.writeFile('temp.json', JSON.stringify(data), 'utf-8', (err) => {
        //   if(err) return console.log(`Error writing results: ${err.toString()}`)
        //   console.log("Done serving Bluetooth Request")
        // })

      })
    })
  });

}

function isWlan0Ok() {
  let data = fs.readFileSync(iface_path, 'utf8')
  let rawContent = data.split('\n')
  let foundWlan0 = false
  let isOk = true
  for (const i in rawContent) {
    let line = rawContent[i].trim()
    if (foundWlan0 && line.indexOf('interface ') >=0 && line.indexOf('#') !== 0) {
      foundWlan0 = false
    }
    if (line.indexOf('interface wlan0') >=0 && line.indexOf('#') !== 0) {
      foundWlan0 = true
    }
    if (foundWlan0 && line.indexOf('nohook wpa_supplicant') >=0 && line.indexOf('#') !== 0) {
      isOk = false
    }
  }
  console.log('Is wlan0 Ok ? ' + isOk)
  return isOk
}


function sleep (sec) {
  console.log('wait for a moment...')
  return new Promise(function(resolve, reject){
    setTimeout(function(){
      resolve(true)
    }, sec*1000)
  })
}

function setMessage (msg) {
  message = msg
  messageTimestamp = new Date().getTime()
}

module.exports = {
  InputCharacteristic,
  InputCharacteristicSep,
  NotifyMassageCharacteristic
}
