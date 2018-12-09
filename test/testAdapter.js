/* jshint -W097 */// jshint strict:false
/*jslint node: true */
var expect = require('chai').expect;
var setup  = require(__dirname + '/lib/setup');
var http = require('http');
var fs = require('fs');

var objects = null;
var states  = null;
var onStateChanged = null;
var onObjectChanged = null;
var sendToID = 1;

var adapterShortName = setup.adapterName.substring(setup.adapterName.indexOf('.')+1);

function decrypt(key, value) {
  var result = '';
  for(var i = 0; i < value.length; ++i) {
      result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
  }
  return result;
}
function encrypt(key, value) {
  var result = '';
  for(var i = 0; i < value.length; ++i) {
      result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
  }
  return result;
}

function checkConnectionOfAdapter(cb, counter) {
    counter = counter || 0;
    console.log('Try check #' + counter);
    if (counter > 30) {
        if (cb) cb('Cannot check connection');
        return;
    }

    states.getState('system.adapter.' + adapterShortName + '.0.alive', function (err, state) {
        if (err) console.error(err);
        if (state && state.val) {
            if (cb) cb();
        } else {
            setTimeout(function () {
                checkConnectionOfAdapter(cb, counter + 1);
            }, 1000);
        }
    });
}

function checkValueOfState(id, value, cb, counter) {
    counter = counter || 0;
    if (counter > 20) {
        if (cb) cb('Cannot check value Of State ' + id);
        return;
    }

    states.getState(id, function (err, state) {
        if (err) console.error(err);
        if (value === null && !state) {
            if (cb) cb();
        } else
        if (state && (value === undefined || state.val === value)) {
            if (cb) cb();
        } else {
            setTimeout(function () {
                checkValueOfState(id, value, cb, counter + 1);
            }, 500);
        }
    });
}

function sendTo(target, command, message, callback) {
    onStateChanged = function (id, state) {
        if (id === 'messagebox.system.adapter.test.0') {
            callback(state.message);
        }
    };

    states.pushMessage('system.adapter.' + target, {
        command:    command,
        message:    message,
        from:       'system.adapter.test.0',
        callback: {
            message: message,
            id:      sendToID++,
            ack:     false,
            time:    (new Date()).getTime()
        }
    });
}

//fritzbox mit http Server Emulieren
var server;

function setupHttpServer(callback) {
    //We need a function which handles requests and send response
    //Create a server
    server = http.createServer(handleHttpRequest);
    //Lets start our server
    server.listen(8080, function() {
        //Callback triggered when server is successfully listening. Hurray!
        console.log("HTTP-Server listening on: http://localhost:%s", 8080);
        callback();
    });
}

//Antworten der fritzbox Gerätes

var secret='Zgfr56gFe87jJOM';
var challenge = (4294967295 + Math.floor(Math.random()*4294967295)).toString(16).slice(-8);
var challenge2 = (4294967295 + Math.floor(Math.random()*4294967295)).toString(16).slice(-8);
var password = 'password';
var challengeResponse = challenge +'-'+require('crypto').createHash('md5').update(Buffer(challenge+'-'+password, 'UTF-16LE')).digest('hex');
var sid = (4294967295 + Math.floor(Math.random()*4294967295)).toString(16).slice(-8)+(4294967295 + Math.floor(Math.random()*4294967295)).toString(16).slice(-8);

//xml Antworten
var content = fs.readFileSync(__dirname + '/../test/test_api_response.xml'); //getdevicelistinfos


function handleHttpRequest(request, response) {
    console.log('HTTP-Server: Request: ' + request.method + ' ' + request.url);

    if (request.url == '/login_sid.lua') { //check the URL of the current request
        response.writeHead(200, { 'Content-Type': 'application/xml' });
        response.write('<?xml version="1.0" encoding="utf-8"?><SessionInfo><SID>0000000000000000</SID><Challenge>'+challenge+'</Challenge><BlockTime>0</BlockTime><Rights></Rights></SessionInfo>');
        response.end(); 
    }
    
    else if (request.url == '/login_sid.lua?username=admin') { //check the URL of the current request
        response.writeHead(200, { 'Content-Type': 'application/xml' });
        response.write('<?xml version="1.0" encoding="utf-8"?><SessionInfo><SID>0000000000000000</SID><Challenge>'+challenge+'</Challenge><BlockTime>0</BlockTime><Rights></Rights></SessionInfo>');
        response.end(); 
    }

    else if (request.url == '/login_sid.lua?username=admin&response='+challengeResponse) { //check the URL of the current request
        response.writeHead(200, { 'Content-Type': 'application/xml' });
        response.write('<?xml version="1.0" encoding="utf-8"?><SessionInfo><SID>'+sid+'</SID><Challenge>'+challenge2+'</Challenge><BlockTime>0</BlockTime><Rights><Name>Dial</Name><Access>2</Access><Name>App</Name><Access>2</Access><Name>HomeAuto</Name><Access>2</Access><Name>BoxAdmin</Name><Access>2</Access><Name>Phone</Name><Access>2</Access><Name>NAS</Name><Access>2</Access></Rights></SessionInfo>');
        response.end(); 
    }
    else if (request.url == '/webservices/homeautoswitch.lua?0=0&sid='+sid+'&switchcmd=getswitchlist') { //check the URL of the current request
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.write(JSON.stringify([ '087610006161', '34:31:C1:AB:68:53', '119600642220', 'EF:C4:CC-900' ]));
        response.end(); 
    }   
    else if (request.url == '/webservices/homeautoswitch.lua?0=0&sid='+sid+'&switchcmd=getdevicelistinfos') { //check the URL of the current request
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.write( String(content) );
        response.end(); 
    }
    else {
        console.log(' not supported call ' + request.url);
        response.statusCode = 403;
        response.end();
    }    
}

describe('Test ' + adapterShortName + ' adapter', function() {
    before('Test ' + adapterShortName + ' adapter: Start js-controller', function (_done) {
        this.timeout(600000); // because of first install from npm

        setup.setupController(systemConfig => {
            var config = setup.getAdapterConfig();
            // enable adapter
            config.common.enabled  = true;
            config.common.loglevel = 'info';
            //config.native.dbtype   = 'sqlite';
   
            config.native = {"fritz_ip": "http://localhost:8080", 
                             "fritz_user": "admin", 
                             "fritz_pw": encrypt(systemConfig.native.secret, 'password'), 
                             "fritz_interval": "300", 
                             "GuestWLANactive": false, 
                             "NonNativeApi": false 
                            };

            setup.setAdapterConfig(config.common, config.native);

            setupHttpServer(function() {
                setup.startController(true, function(id, obj) {}, function (id, state) {
                        if (onStateChanged) onStateChanged(id, state);
                    },
                    function (_objects, _states) {
                        objects = _objects;
                        states  = _states;
                        _done();
                    });
            });
            
        });
    });

/*
    ENABLE THIS WHEN ADAPTER RUNS IN DEAMON MODE TO CHECK THAT IT HAS STARTED SUCCESSFULLY
*/
    it('Test ' + adapterShortName + ' adapter: Check if adapter started', function (done) {
        this.timeout(60000);
        checkConnectionOfAdapter(function (res) {
            if (res) console.log(res);
            expect(res).not.to.be.equal('Cannot check connection');
            objects.setObject('system.adapter.test.0', {
                    common: {

                    },
                    type: 'instance'
                },
                function () {
                    states.subscribeMessage('system.adapter.test.0');
                    done();
                });
        });
    });
/**/

/*
    PUT YOUR OWN TESTS HERE USING
    it('Testname', function ( done) {
        ...
    });
    You can also use "sendTo" method to send messages to the started adapter
*/
   // anfang von eigenen Tests
    /*
    it('Test ' + adapterShortName + ' adapter: Check values', function (done) {
        console.log('START CHECK VALUES');
        this.timeout(90000);
        checkValueOfState('fritzdect.0.DECT200_087610006161.energy', 104560, function() {
            setTimeout(function() {
                checkValueOfState('fritzdect.0.DECT200_087610006161.energy', 104560, function() {
                    done();
                });
            }, 10000);
        });
    });
    */
    it('Test ' + adapterShortName + ' adapter: Check values of switch', function (done) {
        this.timeout(30000);
        setTimeout(function() {
            states.getState('fritzdect.0.DECT200_087610006161.name', function (err, state) {
                if (err) console.error(err);
                expect(state).to.exist;
                if (!state) {
                    console.error('state "fritzdect.0.DECT200_087610006161.name" not set');
                }
                else {
                    console.log('fritzdect.0.DECT200_087610006161.name ... ' + state.val);
                }
                expect(state.val).to.exist;
                expect(state.val).to.be.equal('FRITZ!DECT 200 #1');
                states.getState('fritzdect.0.DECT200_087610006161.state', function (err, state) {
                    if (err) console.error(err);
                    expect(state).to.exist;
                    if (!state) {
                        console.error('state "fritzdect.0.DECT200_087610006161.state" not set');
                    }
                    else {
                        console.log('fritzdect.0.DECT200_087610006161.state ... ' + state.val);
                    }
                    expect(state.val).to.exist;
                    expect(state.val).to.be.equal('1');
                    states.getState('fritzdect.0.DECT200_087610006161.temp', function (err, state) {
                        if (err) console.error(err);
                        expect(state).to.exist;
                        if (!state) {
                            console.error('state "fritzdect.0.DECT200_087610006161.temp" not set');
                        }
                        else {
                            console.log('fritzdect.0.DECT200_087610006161.temp ... ' + state.val);
                        }
                        expect(state.val).to.exist;
                        expect(state.val).to.be.equal(22.5);
                        states.getState('fritzdect.0.DECT200_087610006161.voltage', function (err, state) {
                            if (err) console.error(err);
                            expect(state).to.exist;
                            if (!state) {
                                console.error('state "fritzdect.0.DECT200_087610006161.voltage" not set');
                            }
                            else {
                                console.log('fritzdect.0.DECT200_087610006161.voltage ... ' + state.val);
                            }
                            expect(state.val).to.exist;
                            expect(state.val).to.be.equal(224.645);
                            states.getState('fritzdect.0.DECT200_087610006161.power', function (err, state) {
                                if (err) console.error(err);
                                expect(state).to.exist;
                                if (!state) {
                                    console.error('state "fritzdect.0.DECT200_087610006161.power" not set');
                                }
                                else {
                                    console.log('fritzdect.0.DECT200_087610006161.power ... ' + state.val);
                                }
                                expect(state.val).to.exist;
                                expect(state.val).to.be.equal(0);
                                states.getState('fritzdect.0.DECT200_087610006161.energy', function (err, state) {
                                    if (err) console.error(err);
                                    expect(state).to.exist;
                                    if (!state) {
                                        console.error('state "fritzdect.0.DECT200_087610006161.energy" not set');
                                    }
                                    else {
                                        console.log('check fritzdect.0.DECT200_087610006161.energy ... ' + state.val);
                                        expect(state.val).to.exist;
                                        expect(state.val).to.be.equal('104560');
                                        done();
                                    }
                                });
                            });
                        });
                    });
                });
            });
        }, 1000);
    });
    it('Test ' + adapterShortName + ' adapter: Check values of Comet', function (done) {
        this.timeout(30000);
        setTimeout(function() {
            states.getState('fritzdect.0.Comet_117951022222.temp', function (err, state) {
                if (err) console.error(err);
                expect(state).to.exist;
                if (!state) {
                    console.error('state "fritzdect.0.Comet_117951022222.temp" not set');
                }
                else {
                    console.log('fritzdect.0.Comet_117951022222.temp ... ' + state.val);
                }
                expect(state.val).to.exist;
                expect(state.val).to.be.equal(18);
                states.getState('fritzdect.0.Comet_117951022222.battery', function (err, state) {
                    if (err) console.error(err);
                    expect(state).to.exist;
                    if (!state) {
                        console.error('state "fritzdect.0.Comet_117951022222.battery" not set');
                    }
                    else {
                        console.log('check fritzdect.0.Comet_117951022222.battery ... ' + state.val);
                        expect(state.val).to.exist;
                        expect(state.val).to.be.equal('80');
                        done();
                    }
                });
            });
        }, 1000);
    });
    it('Test ' + adapterShortName + ' adapter: Check values of Contact', function (done) {
        this.timeout(30000);
        setTimeout(function() {
            states.getState('fritzdect.0.Contact_112240205290-1.name', function (err, state) {
                if (err) console.error(err);
                expect(state).to.exist;
                if (!state) {
                    console.error('state "fritzdect.0.Contact_112240205290-1.name" not set');
                }
                else {
                    console.log('fritzdect.0.Contact_112240205290-1.name ... ' + state.val);
                }
                expect(state.val).to.exist;
                expect(state.val).to.be.equal('Fenster');
                states.getState('fritzdect.0.Contact_112240205290-1.state', function (err, state) {
                    if (err) console.error(err);
                    expect(state).to.exist;
                    if (!state) {
                        console.error('state "fritzdect.0.Contact_112240205290-1.state" not set');
                    }
                    else {
                        console.log('check fritzdect.0.Contact_112240205290-1.state ... ' + state.val);
                        expect(state.val).to.exist;
                        expect(state.val).to.be.equal('0');
                        done();
                    }
                });
            });
        }, 1000);
    });
    it('Test ' + adapterShortName + ' adapter: Check values of Button', function (done) {
        this.timeout(30000);
        setTimeout(function() {
            states.getState('fritzdect.0.Button_119340141058-2.name', function (err, state) {
                if (err) console.error(err);
                expect(state).to.exist;
                if (!state) {
                    console.error('state "fritzdect.0.Button_119340141058-2.name" not set');
                }
                else {
                    console.log('fritzdect.0.Button_119340141058-2.name ... ' + state.val);
                }
                expect(state.val).to.exist;
                expect(state.val).to.be.equal('DectTaster_F1');
                states.getState('fritzdect.0.Button_119340141058-2.lastclick', function (err, state) {
                    if (err) console.error(err);
                    expect(state).to.exist;
                    if (!state) {
                        console.error('state "fritzdect.0.Button_119340141058-2.lastclick" not set');
                    }
                    else {
                        console.log('check fritzdect.0.Button_119340141058-2.lastclick... ' + state.val);
                        expect(state.val).to.exist;
                        expect(state.val).to.be.equal('1538426492');
                        done();
                    }
                });
            });
        }, 1000);
    });
    it('Test ' + adapterShortName + ' adapter: Check values of Powerline', function (done) {
        this.timeout(30000);
        setTimeout(function() {
            states.getState('fritzdect.0.DECT200_34:31:C1:AB:68:53.name', function (err, state) {
                if (err) console.error(err);
                expect(state).to.exist;
                if (!state) {
                    console.error('state "fritzdect.0.DECT200_34:31:C1:AB:68:53.name" not set');
                }
                else {
                    console.log('fritzdect.0.DECT200_34:31:C1:AB:68:53.name ... ' + state.val);
                }
                expect(state.val).to.exist;
                expect(state.val).to.be.equal('FRITZ!Powerline');
                states.getState('fritzdect.0.DECT200_34:31:C1:AB:68:53.state', function (err, state) {
                    if (err) console.error(err);
                    expect(state).to.exist;
                    if (!state) {
                        console.error('state "fritzdect.0.DECT200_34:31:C1:AB:68:53.state" not set');
                    }
                    else {
                        console.log('fritzdect.0.DECT200_34:31:C1:AB:68:53.state ... ' + state.val);
                    }
                    expect(state.val).to.exist;
                    expect(state.val).to.be.equal('0');
                    states.getState('fritzdect.0.DECT200_34:31:C1:AB:68:53.lock', function (err, state) {
                        if (err) console.error(err);
                        expect(state).to.exist;
                        if (!state) {
                            console.error('state "fritzdect.0.DECT200_34:31:C1:AB:68:53.lock" not set');
                        }
                        else {
                            console.log('fritzdect.0.DECT200_34:31:C1:AB:68:53.lock ... ' + state.val);
                        }
                        expect(state.val).to.exist;
                        expect(state.val).to.be.equal('0');
                        states.getState('fritzdect.0.DECT200_34:31:C1:AB:68:53.present', function (err, state) {
                            if (err) console.error(err);
                            expect(state).to.exist;
                            if (!state) {
                                console.error('state "fritzdect.0.DECT200_34:31:C1:AB:68:53.present not set');
                            }
                            else {
                                console.log('fritzdect.0.DECT200_34:31:C1:AB:68:53.present ... ' + state.val);
                            }
                            expect(state.val).to.exist;
                            expect(state.val).to.be.equal('1');
                            states.getState('fritzdect.0.DECT200_34:31:C1:AB:68:53.power', function (err, state) {
                                if (err) console.error(err);
                                expect(state).to.exist;
                                if (!state) {
                                    console.error('state "fritzdect.0.DECT200_34:31:C1:AB:68:53.power" not set');
                                }
                                else {
                                    console.log('fritzdect.0.DECT200_34:31:C1:AB:68:53.power ... ' + state.val);
                                }
                                expect(state.val).to.exist;
                                expect(state.val).to.be.equal(0);
                                states.getState('fritzdect.0.DECT200_34:31:C1:AB:68:53.energy', function (err, state) {
                                    if (err) console.error(err);
                                    expect(state).to.exist;
                                    if (!state) {
                                        console.error('state "fritzdect.0.DECT200_34:31:C1:AB:68:53.energy" not set');
                                    }
                                    else {
                                        console.log('check fritzdect.0.DECT200_34:31:C1:AB:68:53.energy ... ' + state.val);
                                        expect(state.val).to.exist;
                                        expect(state.val).to.be.equal('19331');
                                        done();
                                    }
                                });
                            });
                        });
                    });
                });
            });
        }, 1000);
    });
    it('Test ' + adapterShortName + ' adapter: Check values of Repeater', function (done) {
        this.timeout(30000);
        setTimeout(function() {
            states.getState('fritzdect.0.DECT100_087611016969.name', function (err, state) {
                if (err) console.error(err);
                expect(state).to.exist;
                if (!state) {
                    console.error('state "fritzdect.0.DECT100_087611016969.name" not set');
                }
                else {
                    console.log('fritzdect.0.DECT100_087611016969.name ... ' + state.val);
                }
                expect(state.val).to.exist;
                expect(state.val).to.be.equal('Repeater');
                states.getState('fritzdect.0.DECT100_087611016969.present', function (err, state) {
                    if (err) console.error(err);
                    expect(state).to.exist;
                    if (!state) {
                        console.error('state "fritzdect.0.DECT100_087611016969.present" not set');
                    }
                    else {
                        console.log('fritzdect.0.DECT100_087611016969.present ... ' + state.val);
                    }
                    expect(state.val).to.exist;
                    expect(state.val).to.be.equal('1');
                    states.getState('fritzdect.0.DECT100_087611016969.id', function (err, state) {
                        if (err) console.error(err);
                        expect(state).to.exist;
                        if (!state) {
                            console.error('state "fritzdect.0.DECT100_087611016969.id" not set');
                        }
                        else {
                            console.log('fritzdect.0.DECT100_087611016969.id ... ' + state.val);
                        }
                        expect(state.val).to.exist;
                        expect(state.val).to.be.equal('23');
                        states.getState('fritzdect.0.DECT100_087611016969.fwversion', function (err, state) {
                            if (err) console.error(err);
                            expect(state).to.exist;
                            if (!state) {
                                console.error('state "fritzdect.0.DECT100_087611016969.fwversion" not set');
                            }
                            else {
                                console.log('fritzdect.0.DECT100_087611016969.fwversion ... ' + state.val);
                            }
                            expect(state.val).to.exist;
                            expect(state.val).to.be.equal('03.86');
                            states.getState('fritzdect.0.DECT100_087611016969.manufacturer', function (err, state) {
                                if (err) console.error(err);
                                expect(state).to.exist;
                                if (!state) {
                                    console.error('state "fritzdect.0.DECT100_087611016969.manufacturer" not set');
                                }
                                else {
                                    console.log('fritzdect.0.DECT100_087611016969.manufacturer ... ' + state.val);
                                }
                                expect(state.val).to.exist;
                                expect(state.val).to.be.equal('AVM');
                                states.getState('fritzdect.0.DECT100_087611016969.temp', function (err, state) {
                                    if (err) console.error(err);
                                    expect(state).to.exist;
                                    if (!state) {
                                        console.error('state "fritzdect.0.DECT100_087611016969.temp" not set');
                                    }
                                    else {
                                        console.log('check fritzdect.0.DECT100_087611016969.temp ... ' + state.val);
                                        expect(state.val).to.exist;
                                        expect(state.val).to.be.equal(17);
                                        done();
                                    }
                                });
                            });
                        });
                    });
                });
            });
        }, 1000);
    });
    /*
    it('Test ' + adapterShortName + ' adapter: Set values', function (done) {
        console.log('START SET VALUES');
        this.timeout(90000);
        states.setState('fritzdect.0.DECT200_087610006161', {val: false, ack: false, from: 'test.0'}, function (err) {
            if (err) {
                console.log(err);
            }
            checkValueOfState('musiccast.0.DECT200_087610006161', false, function() {
                done();
            });
        });
    });
    */    
    
    
    
    after('Test ' + adapterShortName + ' adapter: Stop js-controller', function (done) {
        this.timeout(10000);

        setup.stopController(function (normalTerminated) {
            console.log('Adapter normal terminated: ' + normalTerminated);
            done();
        });
    });
});
