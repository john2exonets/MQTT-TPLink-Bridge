//
//  Mqtt TPLink Bridge
//    Bridgees MQTT with TPLink devices. Allows for control of TPLink devices,
//    and to query for device status, all using MQTT packets.
//
//  John D. Allen
//  Feb 2019
//-----------------------------------------------------------------------------
//  TP-Link API module: https://github.com/plasticrake/tplink-smarthome-api
//  NOTE: As of current date (Feb. 2019), the examples in this GitHub are
//  incorrect as far as calling the module. The method I found to work is
//  below in the code.
//-----------------------------------------------------------------------------
//  MQTT Packets:
//    Here is the list of implemented commands. Note that "tplinkbridge" is a
//    configurable item in the config.json file, as is "status".
//
//  tplinkbridge/group/{name}/on     --> Turn on all TPLink devices in named group.
//  tplinkbridge/group/{name}off     --> Turn off all TPLink devices in named group.
//  tplinkbridge/plug/{name}/on      --> Turn on specified Plug.
//  tplinkbridge/plug/{name}/off     --> Turn off specified Plug.
//  tplinkbridge/plug/{name}/state   --> Query for state of plug relay
//  status/plug/{name}               --> State of plug relay  {"status": 0}
//  tplinkbridge/light/{name}/on     --> Turn on specified Light.
//  tplinkbridge/light/{name}/off    --> Turn off specified Light.
//  tplinkbridge/light/{name}/state  --> Query for state of light.
//  status/light/{name}              --> State of light  {"status": 1}
//-----------------------------------------------------------------------------
//  Devices Tested On:
//    Plug:
//      HS105(US)
//      HS100(US)
//    Bulb:
//      KL120(US)
//      LB130(US)
//-----------------------------------------------------------------------------
//  Version:
//    0.1  --  Initial version.  Tested with HS105 plug and KS120 bulb.
//
//-----------------------------------------------------------------------------

const TPLink = require('tplink-smarthome-api');
var mqtt = require('mqtt');
var config = require('./config/config.json');

//-----------------------------------------------------------------------------
//  config.json:
// {
//   "debug": true,      // If true, will printout a number of debug messages.
//   "mqtt_broker": "http://mqtt.my.io",   // This program currently assume
//                                            // non-https MQTT Broker connections.
//   "head": "tplinkbridge",
//   "statushead": "status",
//   "retries": 9,              // TP-Link nodes sometimes needs several tries
//   "timeout": 5000,           // before they accept the command. timout is in milliseconds.
//                              // 5000 = 5 seconds.
//   "plugs": [
//     { "name": "Xmas1", "ip": "10.1.1.1", "group": "xmas" },
//     { "name": "Xmas1", "ip": "10.1.1.1", "group": "kitchen" },  // same device in two different groups.
//     { "name": "Xmas2", "ip": "10.1.1.2", "group": "xmas" },
//     { "name": "Xmas3", "ip": "10.1.1.3", "group": "xmas" },
//     { "name": "OutsideXmas", "ip": "10.1.22.12", "group": "xmas" },
//     { "name": "OfficeLights", "ip": "10.1.1.9", "group": "xmas" }
//   ],
//   "lights": [
//     { "name": "OfficeLamp", "ip": "10.1.1.5", "group": "xmas" },
//     { "name": "Kitchen1", "ip": "10.1.1.10", "group': "kitchen" },
//     { "name": "Kitchen2", "ip": "10.1.1.11", "group": "kitchen" },
//     { "name": "Kitchen3", "ip": "10.1.1.12", "group": "kitchen" }
//   ]
// }

var DEBUG = config.debug;
if (DEBUG) { console.log("mqttTPLinkBridge started..."); }

//  Load in device arrays.
var plugs = config.plugs;
var lights = config.lights;
var Topic = config.head + "/";
var StatusTopic = config.statushead + "/";

var sendOptions = '{ "tcp" }';

// MQTT connection options
var copts = {
  clientId: "TPLinkBridge",
  keepalive: 20000
};

//-----------------------------------------------------------------------------
//-----------------------[   MQTT Stuff   ]------------------------------------
//-----------------------------------------------------------------------------
var client = mqtt.connect(config.mqtt_broker, copts);

client.on("connect", function() {
  var tt = Topic + '#';
  client.subscribe(tt);
});

client.on('message', function(topic, message) {
  var out = topic + ": " + message.toString();
  if (DEBUG) { console.log("IN>>" + out); }

  // Check for bad data
  if (message.indexOf("nan") > -1) {
    if (DEBUG) { console.log(">> BAD DATA"); }
    return false;
  }

  var ttmp = topic.split('/');
  //if (DEBUG) { console.log("ARR>>" + ttmp); }
  //
  //  Check for valid Topic/commands
  //
  if (ttmp[1] != "plug" && ttmp[1] != "light" && ttmp[1] != "group") {
    return false;
  } else {
    //
    //  Process Topic/commands
    //
    switch (ttmp[1]) {
      case "plug":
        if (ttmp[3] == "state") {
          getPlugStatus(ttmp[2]);
        } else if (ttmp[3] == "on") {
          setPlugPower(ttmp[2], true, config.retries);
        } else if (ttmp[3] == "off") {
          setPlugPower(ttmp[2], false, config.retries);
        }
        break;
      case "light":
        if (ttmp[3] == "state") {
          getLightStatus(ttmp[2]);
        } else if (ttmp[3] == "on") {
          setLightPower(ttmp[2], true, config.retries);
        } else if (ttmp[3] == "off") {
          setLightPower(ttmp[2], false, config.retries);
        }
        break;
      case "group":
        if (ttmp[3] == "on") {
          setGroupPower(ttmp[2], true, config.retries);
        } else if (ttmp[3] == "off") {
          setGroupPower(ttmp[2], false, config.retries);
        }
        break;
      default:
        return false;
    };
  }
});

//-----------------------------------------------------------------------------
// Function: setGroupPower()
//    Turn Group on or off.
//-----------------------------------------------------------------------------
function setGroupPower(name, on, retries) {
  // if on == true, turn on, on == false, turn off
  plugs.forEach((d) => {
    if (d.group == name) {
      setPlugPower(d.name, on, retries);
    }
  });
  lights.forEach((d) => {
    if (d.group == name) {
      setLightPower(d.name, on, retries);
    }
  });
}

//-----------------------------------------------------------------------------
// Function: setPlugPower()
//    Turn plug on or off. This function has a retry where the function is
//  queued up to run again, and if receiving an error code that denotes
//  a device that is not currently talking to wifi -- which my TP-Link devices
//  seem to do on a frequent basis -- set a timeout before calling the
//  function again.
//-----------------------------------------------------------------------------
function setPlugPower(name, on, retries) {
  // if on == true, turn on, on == false, turn off
  if (retries == 0) {     // Retries exhasted, just fall through.
    if (DEBUG) { console.log(">>Retries Failed for " + name); }
    return;
  }
  plugs.forEach((d) => {
    if (d.name == name) {
      var tp = new TPLink.Client();
      tp.getDevice({host: d.ip}).then((device) => {
        device.setPowerState(on, sendOptions).catch((err) => {
          if (DEBUG) { console.log(err); }
          if (DEBUG) { console.log(">>>Failed to change state for " + name + ", Retries = " + retries.toString()); }
          setTimeout(setPlugPower, config.timeout, name, on, retries -1);
        });
      }).catch((err) => {
        if (DEBUG) { console.log("<" + err.errno + ">"); }
        if (err.errno == "EHOSTUNREACH" || err == "Error: TCP Timeout") {
          if (DEBUG) { console.log(">>Failed to connect to " + name + ", Retries = " + retries.toString()); }
          setTimeout(setPlugPower, config.timeout, name, on, retries - 1);
        } else {
          if (DEBUG) { console.log("---->" + err); }
        }
      });
    }
  });
}

//-----------------------------------------------------------------------------
// Function: setLightPower()
//    Turn light on or off. This function has a retry where the function is
//  queued up to run again, and if receiving an error code that denotes
//  a device that is not currently talking to wifi -- which my TP-Link devices
//  seem to do on a frequent basis -- set a timeout before calling the
//  function again.
//-----------------------------------------------------------------------------
function setLightPower(name, on, retries) {
  // if on == true, turn on, on == false, turn off
  if (retries == 0) {     // Retries exhasted, just fall through.
    if (DEBUG) { console.log(">>Retries Failed for " + name); }
    return;
  }
  lights.forEach((d) => {
    if (d.name == name) {
      var tp = new TPLink.Client();
      tp.getDevice({host: d.ip}).then((device) => {
        device.setPowerState(on, sendOptions).catch((err) => {
          if (DEBUG) { console.log(err); }
          if (DEBUG) { console.log(">>>Failed to change state for " + name + ", Retries = " + retries.toString()); }
          setTimeout(setLightPower, config.timeout, name, on, retries -1);
        });
      }).catch((err) => {
        if (DEBUG) { console.log("[" + err.errno + "]"); }
        if (err.errno == "EHOSTUNREACH" || err == "Error: TCP Timeout") {
          if (DEBUG) { console.log(">>Failed to connect to " + name + ", Retries = " + retries.toString()); }
          setTimeout(setLightPower, config.timeout, name, on, retries - 1);
        } else {
          if (DEBUG) { console.log("---->" + err); }
        }
      });
    }
  });
}

//-----------------------------------------------------------------------------
// Function: getPlugStatus()
//   Return the power status of the specified plug.
//-----------------------------------------------------------------------------
function getPlugStatus(name) {
  plugs.forEach((d) => {
    if (d.name == name) {
      var tp = new TPLink.Client();
      tp.getDevice({host: d.ip}).then((device) => {
        device.getSysInfo().then((out) => {
          //if (DEBUG) { console.log(out); }
          var tt = StatusTopic + "plug/" + name;
          var payl = '{ "status": ' + out.relay_state + ' }';
          client.publish(tt, payl);
        });
      }).catch((err) => {
        console.log(err);
      });
    }
  });
}

//-----------------------------------------------------------------------------
// Function: getLightStatus()
//   Return the power status of the specified light.
//-----------------------------------------------------------------------------
function getLightStatus(name) {
  lights.forEach((d) => {
    if (d.name == name) {
      var tp = new TPLink.Client();
      tp.getDevice({host: d.ip}).then((device) => {
        device.getSysInfo().then((out) => {
          var tt = StatusTopic + "light/" + name;
          var payl = '{ "status": ' + out.light_state.on_off + ' }';
          client.publish(tt, payl);
        });
      }).catch((err) => {
        console.log(err);
      });
    }
  });
}

