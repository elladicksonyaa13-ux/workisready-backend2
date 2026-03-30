// src/data/categoryMapping.js

export const jobToWorkerMap = {
  "AC Repair": "AC Repairer",
  "Carpentry": "Carpenter",
  "Cleaning": "Cleaner",
  "Delivery": "Delivery Service",
  "Dish Installation": "Dish Installer",
  "Electrical Services": "Electrician",
  "Fridge Repair": "Fridge Repairer",
  "Gardening": "Gardener",
  "Laundry Services": "Laundry",
  "Masonry": "Mason",
  "Plumbing": "Plumber",
  "TV Repair": "TV Repairer",
  "Barbering": "Barber",
  "Hair Dressing": "Hair Dresser",
  "Sewing & Tailoring": "Seamstress & Tailor",
  "Manicures & Pedicures": "Nail Technician",
};

// Reverse map: worker → job
export const workerToJobMap = Object.fromEntries(
  Object.entries(jobToWorkerMap).map(([job, worker]) => [worker, job])
);

// Expands categories in both directions
export const expandJobCategories = (categories) => {
  const expanded = new Set(categories);
  categories.forEach(cat => {
    if (jobToWorkerMap[cat]) expanded.add(jobToWorkerMap[cat]);
    if (workerToJobMap[cat]) expanded.add(workerToJobMap[cat]);
  });
  return Array.from(expanded);
};