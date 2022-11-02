/**
 * sonoff-diy-adapter.js - sonoff-diy adapter.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

'use strict';

const {
  Adapter,
  Device,
  Property,
  Database,
} = require('gateway-addon');

var Client = require('node-rest-client').Client;

const manifest = require('./manifest.json');

function on() {
  return {
    name: 'on',
    value: false,
    metadata: {
      title: 'On/Off',
      type: 'boolean',
      '@type': 'OnOffProperty',
    },
  };
}

function sleep(ms){
  return new Promise(resolve => {
      setTimeout(resolve,ms)
  })
}

const toggleSwitch = {
  '@context': 'https://iot.mozilla.org/schemas',
  '@type': ['OnOffSwitch'],
  name: 'On Off Switch',
  properties: [
    on(),
  ],
  actions: [],
  events: [],
};

class sonoffProperty extends Property {
  constructor(device, name, descr, value) {
    super(device, name, descr);
    this.setCachedValue(value);
  }

  /**
   * Set the value of the property.
   *
   * @param {*} value The new value to set
   * @returns a promise which resolves to the updated value.
   *
   * @note it is possible that the updated value doesn't match
   * the value passed in.
   */
  setValue(value) {
    return new Promise((resolve) => {
      const changed = (this.value !== value);
      this.setCachedValue(value);
      resolve(this.value);
      if(this.name == 'on') {
        this.device.notifyStateChanged(this, 1/*changed*/);
      }
      else {
        /* should not happen */
      }
    });
  }
}

class sonoffDevice extends Device {
  constructor(adapter, id, template, config) {
    super(adapter, id);
    this.name = template.name;
    this.config = config;
    this['@context'] = template['@context'];
    this['@type'] = template['@type'];
    for (const prop of template.properties) {
      this.properties.set(prop.name,
                          new sonoffProperty(this, prop.name, prop.metadata, prop.value));
    }
  }

  notifyStateChanged(property, changed) {
    super.notifyPropertyChanged(property);
    if(('on' == property.name) && changed) {
       this.adapter.sendProperties(this.id, property.value);
    }
  }
}

class sonoffAdapter extends Adapter {
  constructor(addonManager, config) {
    super(addonManager, manifest.id, manifest.id);
    addonManager.addAdapter(this);
    for (var i = 0; i < config.switches.length; i++) {
      this.addDevice('sonoff-diy-adapter-' + i.toString(), toggleSwitch, config.switches[i]);
    }
  }

  /**
   * Add a new device to the adapter.
   *
   * The important part is to call: `this.handleDeviceAdded(device)`
   *
   * @param {String} deviceId ID of the device to add.
   * @param {String} deviceDescription Description of the device to add.
   * @return {Promise} which resolves to the device added.
   */
  addDevice(deviceId, deviceDescription, deviceConfig) {
    return new Promise((resolve, reject) => {
      if (deviceId in this.devices) {
        reject(`Device: ${deviceId} already exists.`);
      } else {
        const device = new sonoffDevice(this, deviceId, deviceDescription, deviceConfig);
        this.handleDeviceAdded(device);
        resolve(device);
      }
    });
  }

  /**
   * Remove a device from the adapter.
   *
   * The important part is to call: `this.handleDeviceRemoved(device)`
   *
   * @param {String} deviceId ID of the device to remove.
   * @return {Promise} which resolves to the device removed.
   */
  removeDevice(deviceId) {
    return new Promise((resolve, reject) => {
      const device = this.devices[deviceId];
      if (device) {
        this.handleDeviceRemoved(device);
        resolve(device);
      } else {
        reject(`Device: ${deviceId} not found.`);
      }
    });
  }

  /**
   * Start the pairing/discovery process.
   *
   * @param {Number} timeoutSeconds Number of seconds to run before timeout
   */
  startPairing(_timeoutSeconds) {
    console.log('sonoff-diyAdapter:', this.name,
                'id', this.id, 'pairing started');
    //this.addDevice('sonoff-diy-adapter', toggleSwitch);
  }

  /**
   * Cancel the pairing/discovery process.
   */
  cancelPairing() {
    console.log('sonoff-diyAdapter:', this.name, 'id', this.id,
                'pairing cancelled');
  }

  /**
   * Unpair the provided the device from the adapter.
   *
   * @param {Object} device Device to unpair with
   */
  removeThing(device) {
    console.log('sonoff-diyAdapter:', this.name, 'id', this.id,
                'removeThing(', device.id, ') started');

    this.removeDevice(device.id).then(() => {
      console.log('sonoff-diyAdapter: device:', device.id, 'was unpaired.');
    }).catch((err) => {
      console.error('sonoff-diyAdapter: unpairing', device.id, 'failed');
      console.error(err);
    });
  }

  /**
   * Cancel unpairing process.
   *
   * @param {Object} device Device that is currently being paired
   */
  cancelRemoveThing(device) {
    console.log('sonoff-diyAdapter:', this.name, 'id', this.id,
                'cancelRemoveThing(', device.id, ')');
  }

  sendProperties(deviceId, state) {
    var client = new Client();

    // set content-type header and data as json in args
    var args = {
      data: { "on": state },
      headers: { "Content-Type": "application/json" }
    };

    // Skip the next update after a sendProperty
    if (this.devices[deviceId]) {
      this.devices[deviceId].recentlyUpdated = true;
    }
    client.post("http://" + this.devices[deviceId].config.IP + ":" + this.devices[deviceId].config.Port + "/zeroconf/switch", 
                args, (data, response)=> {
                                          // parsed response body as js object
                                          //console.log(data);
                                          // raw response
                                          //console.log(response);
                                        });
  }
}

function loadsonoffAdapter(addonManager) {
  const db = new Database(manifest.id);
  db.open().then(() => {
    return db.loadConfig();
  }).then((config) => {
    console.log('sonoff-diyAdapter:', config.bulbs);
    new sonoffAdapter(addonManager, config);
  });
}

module.exports = loadsonoffAdapter;
