// Make the training dataset.
var training = input.sample({
  region: region,
  scale: 30,
  numPixels: 5000
});

// Instantiate the clusterer and train it.
var clusterer = ee.Clusterer.wekaKMeans(10).train(training);

// Cluster the input using the trained clusterer.
var result = input.cluster(clusterer);

// Display the clusters with random colors.
Map.addLayer(result.randomVisualizer().clip(region), {}, 'clusters');



// SNIC
var snic = ee.Algorithms.Image.Segmentation.SNIC({
  image: dumpzone,
  size: 32,
  compactness: 10,
  connectivity: 8,
  neighborhoodSize:256/2,
  seeds: seeds});
  
var clusters = snic.select('clusters')
Map.addLayer(clusters.randomVisualizer(), {}, 'clusters')