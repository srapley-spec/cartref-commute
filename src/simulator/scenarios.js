// Session-local scenario definitions; no application state or inference.
function createJourneySimulationScenarioDefinitions(){
const points={home:[51.975,-0.23],walk:[51.9775,-0.2295],let:[51.98002,-0.22909],
 north:[51.9017,-0.2071],approach:[51.5646,-0.1063],kgx:[51.53197,-0.12341],stp:[51.53062,-0.12594],
 far:[51.52036,-0.10514],farTube:[51.5205,-0.1053],kxTube:[51.5307,-0.1237],
 barbican:[51.5201,-0.0973],ald:[51.5142,-0.0755],officeWalk:[51.5140,-0.0733],office:[51.5139,-0.071],nearHome:[51.978,-0.2295]};
// Separate outbound/return schedules: minutes from 08:44 / 15:44 UTC by default.
const routes={
 'outbound-kgx':[['home','Home',0],['walk','Travelling to Letchworth',8],['let','Waiting at Letchworth',16],['let','Board Great Northern',21,'rail'],['north','On train at Stevenage',32,'rail'],['approach','Approaching King’s Cross',50,'rail'],['kgx','Alight at King’s Cross',57],['kxTube','Walk to Underground platforms',63],['kxTube','Board eastbound Underground',64,'tube'],['barbican','Barbican — GPS returns',72,'tube'],['ald','Alight at Aldgate',78],['officeWalk','Walking to office',82],['office','Arrive at office',86],['office','Office dwell',97]],
 'outbound-far':[['home','Home',0],['walk','Travelling to Letchworth',8],['let','Waiting at Letchworth',16],['let','Board Thameslink',28,'rail'],['north','On train at Stevenage',40,'rail'],['approach','Approaching St Pancras',65,'rail'],['stp','Passing St Pancras',71,'rail'],['far','Alight at Farringdon',76],['farTube','Walk to Underground platforms',80],['farTube','Board eastbound Underground',83,'tube'],['barbican','Barbican — GPS returns',86,'tube'],['ald','Alight at Aldgate',92],['officeWalk','Walking to office',96],['office','Arrive at office',100],['office','Office dwell',111]],
 'return-kgx':[['office','Office',0],['officeWalk','Walking to Aldgate',3],['ald','At Aldgate westbound platforms',7],['ald','Board westbound Underground',10,'tube'],['barbican','Barbican — GPS returns',18,'tube'],['kxTube','Alight at King’s Cross St Pancras',24],['kgx','Waiting at King’s Cross National Rail',28],['kgx','Board Great Northern for Letchworth',33,'rail'],['approach','Leaving London',40,'rail'],['north','On train at Stevenage',57,'rail'],['let','Alight at Letchworth',69],['nearHome','Nearly home',74],['home','Arrive home',80]],
 'return-far':[['office','Office',0],['officeWalk','Walking to Aldgate',3],['ald','At Aldgate westbound platforms',7],['ald','Board westbound Underground',10,'tube'],['barbican','Barbican — GPS returns',18,'tube'],['farTube','Alight at Farringdon',20],['far','Waiting on northbound Thameslink platform',28],['far','Board Thameslink for Letchworth',36,'rail'],['stp','Passing St Pancras northbound',41,'rail'],['approach','Leaving London',49,'rail'],['north','On train at Stevenage',72,'rail'],['let','Alight at Letchworth',84],['nearHome','Nearly home',89],['home','Arrive home',95]]
};
const railLine=[points.let,[51.9533,-0.2635],points.north,[51.8667,-0.1876],[51.8233,-0.1920],[51.8010,-0.2040],[51.7638,-0.2156],[51.6973,-0.1925],[51.6141,-0.1431],[51.5983,-0.1201],points.approach,points.kgx];
return {points,routes,railLine};
}
