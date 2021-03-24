//*** Dumping detection v0.3
// Worldview 2 sample
// Single date
// PCA
// SVM and RF
// Map.addLayer(image, trueColor, "Worldview True Color");

// PCA Code
var getPrincipalComponents = function(centered, scale, region) {
  
  // Collapse the bands of the image into a 1D array per pixel.
  var arrays = centered.toArray();
  print('PCA applying on', centered);
  
  // Compute the covariance of the bands within the region.
  var covar = arrays.reduceRegion({
    reducer: ee.Reducer.centeredCovariance(),
    geometry: region,
    scale: scale,
    maxPixels: 1e9
  });

  // Get the 'array' covariance result and cast to an array.
  // This represents the band-to-band covariance within the region.
  var covarArray = ee.Array(covar.get('array'));

  // Perform an eigen analysis and slice apart the values and vectors.
  var eigens = covarArray.eigen();

  // This is a P-length vector of Eigenvalues.
  var eigenValues = eigens.slice(1, 0, 1);
  
  // This is a PxP matrix with eigenvectors in rows.
  var eigenVectors = eigens.slice(1, 1);

  // Convert the array image to 2D arrays for matrix computations.
  var arrayImage = arrays.toArray(1);

  // Left multiply the image array by the matrix of eigenvectors.
  var principalComponents = ee.Image(eigenVectors).matrixMultiply(arrayImage);

  // Turn the square roots of the Eigenvalues into a P-band image.
  var sdImage = ee.Image(eigenValues.sqrt())
    .arrayProject([0]).arrayFlatten([getNewBandNames('sd')]);

  // Turn the PCs into a P-band image, normalized by SD.
  return principalComponents
    // Throw out an an unneeded dimension, [[]] -> [].
    .arrayProject([0])
    // Make the one band array image a multi-band image, [] -> image.
    .arrayFlatten([getNewBandNames('pc')])
    // Normalize the PCs by their SDs.
    .divide(sdImage);
};

// Mean center the data to enable a faster covariance reducer
// and an SD stretch of the principal components.
var meanDict = image.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: region,
  scale: scale,
  maxPixels: 1e100
});
var means = ee.Image.constant(meanDict.values(bandNames));
var centered = image.subtract(means);

// This helper function returns a list of new band names.
var getNewBandNames = function(prefix) {
  var seq = ee.List.sequence(1, bandNames.length());
  return seq.map(function(b) {
    return ee.String(prefix).cat(ee.Number(b).int());
  });
};

// PCA
var bands = ['b1','b2','b3','b4','b5','b6','b7','b8']; // the band have different resolutions.
// var sentbands = ['B2','B3','B4','B8']; 
//var region = image.geometry();
var region = trialAOI;
var Image = image.select(bands);
var scale = 2;
var bandNames = image.bandNames();

var pcImage = getPrincipalComponents(centered, scale, region);

// Plot PC as a new layer
//Map.addLayer(pcImage, {bands: ['pc1', 'pc2', 'pc3'], min: -2, max: 2}, 'PCA');
Map.setCenter(46.586261644678956,24.645804649257613, 15);

// get training data and merge
var newfcc = dev2.merge(undev2).merge(veg2).merge(Piledump).merge(Road);

// Create training data: collecting the reflectance values for each point,'pc6','pc7'
var PCAbands = ['pc1', 'pc2','pc3','pc4','pc5'];
var training = pcImage.select(PCAbands).sampleRegions({
  collection: newfcc,
  properties: ['dump'],
  scale: scale  
});
var PCAno = PCAbands.length;

// Random Forest (RF)
// Make a Random Forest classifier and train it.
var RFclassifier = ee.Classifier.smileRandomForest(20).train({
  features: training,
  classProperty: 'dump',
  inputProperties: PCAbands
});
var RFtrained = RFclassifier.train(training, 'dump', PCAbands);
var RFclassified = pcImage.classify(RFtrained);


// Map RF output
// var RFdumpzone = RFclassified.expression("(b('classification') == 1) ? 1" + ": 0");
var RFdumpzone = RFclassified.updateMask(RFclassified.neq(0));

//Map.addLayer(RFdumpzone, {min: 1, max: 1, palette: ['red'], opacity:1},
//             'RF Dumping');

// RF Export 
Export.image.toDrive({
  image: RFdumpzone,
  description: 'WV2-RF-PCA7-dumping',
  scale: scale,
  region: region
});


// RF VALIDATION
var valNames = Piledumpval.merge(Vegval).merge(Devval).merge(Undeval).merge(Roadval);
// Sample your classification results to your new validation areas
var RFval = RFclassified.sampleRegions({
  collection: valNames,
  properties: ['dump'],
  scale: scale,
});
print(RFval);

//Compare the landcover of your validation data against the classification result
var RFtestAccuracy = RFval.errorMatrix('dump', 'classification');

// Print the error matrix to the console
print('RF Validation error matrix: ', RFtestAccuracy);

// Print the overall accuracy to the console
print('RF Validation overall accuracy: ', RFtestAccuracy.accuracy());

// SVM
// Create an SVM classifier with custom parameters.
var SVMclassifier = ee.Classifier.libsvm({
  kernelType: 'RBF',
  gamma: 0.5,
  cost: 0.1
});

var SVMtrained = SVMclassifier.train({
  features: training,
  classProperty: 'dump',
  inputProperties: PCAbands
});
var SVMclassified = pcImage.classify(SVMtrained);

//Map.addLayer(SVMclassified, {min: 0, max: 1, palette: ['white','blue']},'SVM classification');
// var SVMdumpzone = SVMclassified.expression(
//    "(b('classification') == 1) ? 1" + ": 0");
    
var SVMdumpzone = SVMclassified.updateMask(SVMclassified.neq(0));
Map.addLayer(SVMdumpzone, {min: 1, max: 1, palette: ['blue'], opacity:1}, 'SVM Dumping');

// SVM export
Export.image.toDrive({
  image: SVMdumpzone,
  description: 'WV2-SVM-PCA7-dumping',
  scale: scale,
  region: region
});

// SVM VALIDATION
// Sample your classification results to your new validation areas
var SVMval = SVMclassified.sampleRegions({
  collection: valNames,
  properties: ['dump'],
  scale: scale,
});
print(SVMval);

// Compare the landcover of your validation data against the classification result
var SVMtestAccuracy = SVMval.errorMatrix('dump', 'classification');

// Print the error matrix to the console
print('SVM Validation error matrix: ', SVMtestAccuracy);

// Print the overall accuracy to the console
print('SVM Validation overall accuracy: ', SVMtestAccuracy.accuracy());

var seeds = ee.Algorithms.Image.Segmentation.seedGrid(36);

// SNIC
var snic = ee.Algorithms.Image.Segmentation.SNIC({
  image: SVMdumpzone,
  size: 32/2,
  compactness: 2,
  connectivity: 8,
  neighborhoodSize: 256/2,
  seeds: seeds});
  
var clusters = snic.select('clusters');
//Map.addLayer(clusters.randomVisualizer(), {}, 'SVM clusters');

// Export SVM clusters
Export.image.toDrive({
  image: clusters,
  description: 'WV2-SVM-PCA7-clusters',
  scale: scale,
  region: region
});

