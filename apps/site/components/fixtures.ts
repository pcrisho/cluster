// People's names stay; positions and areas are read from the catalog (`mocks.data`).
export const demoPeople = [
  { key: "ana", name: "Ana Torres", initials: "AT", area: "engineering" },
  { key: "diego", name: "Diego Ramírez", initials: "DR", area: "engineering" },
  { key: "lucia", name: "Lucía Fernández", initials: "LF", area: "design" },
  { key: "mateo", name: "Mateo Silva", initials: "MS", area: "people" },
  {
    key: "valentina",
    name: "Valentina Ríos",
    initials: "VR",
    area: "operations",
  },
  { key: "javier", name: "Javier Morales", initials: "JM", area: "sales" },
] as const

// The learner of the hero is the same Diego the report shows at 3 of 5.
export const demoLearner = {
  name: demoPeople[1].name,
  initials: demoPeople[1].initials,
  email: "diego.ramirez@acme.com",
}
