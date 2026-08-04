// Assign a syllabus topic to a question from its text, without a model.
//
// WHY NOT JUST ASK THE AI
//
// Topic is the field the whole PYQ pattern derivation runs on (see
// pyqPattern.js) — a question with no topic displays fine but teaches the
// generator nothing. Public datasets very often ship without one.
//
// Classifying 500 questions with a model costs 500 calls. Doing it with a
// weighted keyword table costs nothing, runs instantly, and is auditable: when
// it gets one wrong you can see exactly which keyword did it and fix the table,
// which is not true of a model's opinion.
//
// It is deliberately conservative. Below a confidence floor it returns null
// rather than guessing, because a WRONG topic is worse than a missing one — it
// silently skews the generated paper toward a chapter the examiner never
// emphasised.
//
// Topic names are returned exactly as they appear in examSyllabus.js so they
// group correctly in the frequency table.

/**
 * Weighted signals per unit. Weight 3 = the term is near-conclusive for that
 * unit; 1 = weak on its own, meaningful when several co-occur.
 *
 * Order within the file does not matter — the highest total score wins — but
 * strong markers do the real work of separating overlapping chapters like
 * Vector Algebra and Three Dimensional Geometry.
 */
const JEE_MATHS = {
  "Sets, Relations and Functions": [
    [/\b(reflexive|symmetric|transitive|equivalence relation)\b/i, 3],
    [/\b(injective|surjective|bijective|one[- ]one|onto)\b/i, 3],
    [/\b(subset|superset|power set|universal set|venn)\b/i, 3],
    [/\b(domain|co-?domain|range) of\b/i, 2],
    [/\b(union|intersection) of (the )?sets?\b/i, 2],
    [/\bset\b/i, 1],
  ],
  "Complex Numbers and Quadratic Equations": [
    [/\b(argand|conjugate of|purely imaginary)\b/i, 3],
    [/\bcomplex number/i, 3],
    [/\b(discriminant|roots of the (quadratic )?equation)\b/i, 3],
    [/\b(quadratic|imaginary)\b/i, 2],
    [/\b(alpha|α)\b.{0,25}\b(beta|β)\b.{0,25}\broots\b/i, 3],
    [/\|\s*z\s*\|/i, 3],
  ],
  "Matrices and Determinants": [
    [/\b(matrix|matrices|determinant|adjoint|adj\s*[A-Z])\b/i, 3],
    [/\b(singular|non-?singular|transpose|idempotent|symmetric matrix)\b/i, 3],
    [/\b(cofactor|minor of|trace of)\b/i, 3],
    [/\border\s*3\s*[x×]\s*3\b/i, 3],
  ],
  "Permutations and Combinations": [
    [/\b(permutation|combination)s?\b/i, 3],
    [/\b(\^n\s*[CP]_?r|nCr|nPr)\b/i, 3],
    [/\bnumber of (ways|arrangements|words|committees)\b/i, 3],
    [/\b(arranged|seated|selected) (in|from)\b/i, 2],
  ],
  "Binomial Theorem and its Simple Applications": [
    [/\bbinomial\b/i, 3],
    [/\b(middle|general|independent) term\b/i, 3],
    [/\bcoefficient of\s*x\s*\^?\s*\d/i, 3],
    [/\bexpansion of\b/i, 2],
    [/\bremainder when\b/i, 3],
    [/\bsum of (the )?(binomial )?coefficients\b/i, 3],
  ],
  "Sequence and Series": [
    [/\b(A\.?P\.?|G\.?P\.?|H\.?P\.?)\b/, 3],
    [/\b(arithmetic|geometric|harmonic) (progression|mean|series)\b/i, 3],
    [/\b(common (difference|ratio))\b/i, 3],
    [/\bsum of (the )?first\b/i, 2],
    [/\bn\s*th term\b/i, 2],
  ],
  "Limit, Continuity and Differentiability": [
    [/\b(differentiab(le|ility)|continuous at|continuity)\b/i, 3],
    [/\blim(it)?\b.{0,20}(x\s*(→|->|\\to))/i, 3],
    [/\b(Rolle|Lagrange|mean value theorem)\b/i, 3],
    [/\b(local |global )?(maxima|minima|maximum value|minimum value)\b/i, 2],
    [/\b(increasing|decreasing|monotonic)\b/i, 2],
    [/\b(derivative|dy\/dx|f'\(x\))/i, 2],
    [/\b(tangent|normal) to the curve\b/i, 2],
    [/\b(tangent|normal)\b.{0,45}\bcurve\b/i, 3],
    [/\brate of change\b/i, 3],
    [/\b(absolute|local) (maximum|minimum)\b/i, 3],
    [/\bdomain of the function\b/i, 2],
  ],
  "Integral Calculus": [
    [/\b(integral|integration|integrate|antiderivative)\b/i, 3],
    [/∫|\\int\b/, 3],
    [/\barea (bounded|enclosed|of the region)\b/i, 3],
    [/\bdefinite integral\b/i, 3],
  ],
  "Differential Equations": [
    [/\bdifferential equation\b/i, 3],
    [/\b(order and degree|integrating factor)\b/i, 3],
    [/\b(general|particular) solution\b/i, 2],
  ],
  "Co-ordinate Geometry": [
    [/\b(parabola|ellipse|hyperbola)\b/i, 3],
    [/\b(latus rectum|directrix|eccentricity|focus of|foci)\b/i, 3],
    [/\b(locus|circumcentre|orthocentre|incentre)\b/i, 3],
    [/\bequation of the (line|circle|chord|tangent)\b/i, 2],
    [/\b(straight line|slope of)\b/i, 2],
    [/\bcircle\b/i, 1],
  ],
  "Three Dimensional Geometry": [
    [/\b(direction (cosines|ratios))\b/i, 3],
    [/\b(skew lines|shortest distance between the lines)\b/i, 3],
    [/\bequation of the plane\b/i, 3],
    [/\bplane\b.{0,30}\b(perpendicular|parallel|contains)\b/i, 2],
  ],
  "Vector Algebra": [
    [/\b(scalar triple product|vector triple product|dot product|cross product)\b/i, 3],
    [/\b(vec|vector)s?\b.{0,20}\b(magnitude|perpendicular|parallel|projection)\b/i, 2],
    [/\\(hat|vec)\{?[ijk]\}?/i, 3],
    [/\bvector\b/i, 1],
    [/\bunit vectors?\b/i, 3],
    [/[ˆ^]\s*[ijk]\b/, 2],
    [/\b(angle between).{0,25}\b(vectors?|a and b)\b/i, 2],
  ],
  "Statistics and Probability": [
    [/\bprobabilit(y|ies)\b/i, 3],
    [/\b(variance|standard deviation|mean deviation)\b/i, 3],
    [/\b(binomial|normal) distribution\b/i, 3],
    [/\b(random variable|mutually exclusive|independent events)\b/i, 3],
    [/\bP\s*\(\s*[A-Z]\s*[|)]/, 3],
    [/\b(dice|die|coin|urn|bag contains)\b/i, 2],
    [/\b(mean|median|mode)\b/i, 1],
  ],
  Trigonometry: [
    [/\b(sin|cos|tan|cot|sec|cosec)\s*\^?\s*-\s*1|arc(sin|cos|tan)/i, 3],
    [/\btrigonometric\b/i, 3],
    [/\b(height and distance|angle of (elevation|depression))\b/i, 3],
    [/\\(sin|cos|tan|cot|sec|csc)\b/i, 1],
    [/\b(sin|cos|tan)\s*\(?\s*(θ|theta|x|A|B)/i, 1],
    [/\((tan|cot|sin|cos)\s*x\)/i, 2],
    [/\b(sin|cos|tan|cot|sec|cosec)\s*(θ|α|β|x|2x|A)\b/i, 2],
    [/\bgeneral solution of the equation\b/i, 3],
  ],
};

/**
 * NEET Physics — unit names exactly as in examSyllabus.js NEET.
 * NEET and JEE Main share most of the Physics syllabus, so this table also
 * serves JEE Main Physics (see TABLES below).
 */
const NEET_PHYSICS = {
  "Physics and Measurement": [
    [/\b(dimensional (analysis|formula)|significant figures|least count|vernier|screw gauge)\b/i, 3],
    [/\bdimensions of\b/i, 3],
    [/\b(percentage|relative) error\b/i, 3],
    [/\b(same|different|identical) dimensions\b/i, 3],
    [/\bdimension(al)?\b/i, 2],
    [/\b(fundamental|derived) quantit(y|ies)\b/i, 3],
    [/\b(SI|S\.I\.) unit\b/i, 2],
    [/\bmaximum error in the measurement\b/i, 3],
  ],
  Kinematics: [
    [/\b(projectile|relative velocity)\b/i, 3],
    [/\b(displacement|velocity|acceleration)\b.{0,40}\btime\b/i, 2],
    [/\buniformly accelerated\b/i, 3],
    [/\b(velocity|position|acceleration)[- ]time graph\b/i, 3],
    [/\b(thrown|projected|dropped) (vertically|upward|from (a|the) (top|height))/i, 3],
    [/\b(range|maximum height) of the projectile\b/i, 3],
    [/\bdistance (travelled|covered)\b/i, 2],
  ],
  "Laws of Motion": [
    [/\b(friction|coefficient of friction|normal reaction)\b/i, 3],
    [/\b(newton'?s (first|second|third) law|free body)\b/i, 3],
    [/\b(banking of road|centripetal force|tension in the string)\b/i, 3],
    [/\b(impulse|pseudo force|inertial frame)\b/i, 3],
    [/\btension\b/i, 2],
    [/\b(block|body) (of mass )?\w{0,12}\b(slides?|sliding|placed) on\b/i, 2],
    [/\binclined plane\b/i, 2],
  ],
  "Work, Energy and Power": [
    [/\b(work[- ]energy theorem|conservative force)\b/i, 3],
    [/\b(kinetic|potential) energy\b/i, 3],
    [/\b(elastic|inelastic) collision\b/i, 3],
    [/\bpower delivered\b/i, 2],
    [/\b(work done|net work)\b/i, 3],
    [/\bconservation of (mechanical )?energy\b/i, 3],
  ],
  "Rotational Motion": [
    [/\b(moment of inertia|torque|angular momentum|radius of gyration)\b/i, 3],
    [/\b(rolling without slipping|centre of mass)\b/i, 3],
  ],
  Gravitation: [
    [/\b(escape velocity|orbital velocity|gravitational potential|kepler)\b/i, 3],
    [/\bsatellite\b/i, 2],
    [/\bgravitational (field|force|constant|attraction)\b/i, 3],
    [/\b(surface|centre) of (the )?earth\b/i, 3],
    [/\bacceleration due to gravity\b/i, 3],
    [/\b(radius|mass) of (the )?earth\b/i, 3],
  ],
  "Properties of Solids and Liquids": [
    [/\b(young'?s modulus|bulk modulus|elasticity|surface tension|viscosity)\b/i, 3],
    [/\b(bernoulli|capillary|terminal velocity|stoke)\b/i, 3],
  ],
  Thermodynamics: [
    [/\b(isothermal|adiabatic|carnot|heat engine|entropy)\b/i, 3],
    [/\b(first|second) law of thermodynamics\b/i, 3],
    [/\b(isobaric|isochoric|efficiency of the (engine|cycle)|refrigerator)\b/i, 3],
    [/\b(heat (absorbed|rejected|supplied)|work done by the gas)\b/i, 3],
  ],
  "Kinetic Theory of Gases": [
    [/\b(mean free path|degrees of freedom|rms speed|equipartition)\b/i, 3],
    [/\bideal gas\b/i, 2],
    [/\b(root mean square|molecular speed|mean speed of)\b/i, 3],
    [/\b(monatomic|diatomic|polyatomic) gas\b/i, 3],
    [/\b(moles? of (an? )?(ideal )?gas|gas is enclosed)\b/i, 3],
    [/\b(enclosed in a (vessel|container)|speed of (its |the )?molecules)\b/i, 3],
  ],
  "Oscillations and Waves": [
    [/\b(simple harmonic|s\.?h\.?m\.?|resonance|beats|doppler)\b/i, 3],
    [/\b(standing wave|stationary wave|wavelength|frequency of the wave)\b/i, 2],
    [/\b(pendulum|spring constant)\b/i, 2],
    [/\b(transverse|longitudinal|progressive|superpos\w+) wave/i, 3],
    [/\bequations? of (two )?waves?\b/i, 3],
    [/\b(amplitude|phase difference|angular frequency)\b/i, 2],
    [/\by\s*=\s*\w{0,3}\s*sin\b/i, 3],
    [/\b(organ pipe|sonometer|speed of sound)\b/i, 3],
  ],
  Electrostatics: [
    [/\b(gauss'?s law|electric flux|electric dipole|equipotential)\b/i, 3],
    [/\b(capacitor|capacitance|dielectric)\b/i, 3],
    [/\bcoulomb\b/i, 2],
    [/\belectric field\b/i, 3],
    [/\b(point charge|charged (particle|sphere|droplet|plate))\b/i, 3],
    [/\belectric potential\b/i, 3],
    [/\bcharge (of|on) (the|a)\b/i, 2],
  ],
  "Current Electricity": [
    [/\b(kirchhoff|wheatstone|potentiometer|drift velocity)\b/i, 3],
    [/\b(resistivity|internal resistance|ohm'?s law)\b/i, 3],
    [/\b(resistors?|resistances?) (of|in) (series|parallel)\b/i, 3],
    [/\b(ammeter|voltmeter|galvanometer|shunt)\b/i, 3],
    [/\b(cell|battery) of emf\b/i, 3],
    [/\bcurrent (flowing|through the circuit)\b/i, 2],
  ],
  "Magnetic Effects of Current and Magnetism": [
    [/\b(biot[- ]savart|ampere'?s (circuital )?law|solenoid|cyclotron)\b/i, 3],
    [/\b(magnetic (moment|dipole|field due to))\b/i, 3],
    [/\bmagnetic field at the (centre|center)\b/i, 3],
    [/\b(circular coil|current[- ]carrying (wire|conductor|loop))\b/i, 3],
    [/\b(magnetic field|magnetic flux density|permeability)\b/i, 2],
  ],
  "Electromagnetic Induction and Alternating Currents": [
    [/\b(faraday|lenz|self[- ]induct|mutual induct|back emf)\b/i, 3],
    [/\b(alternating current|reactance|impedance|power factor|transformer|l-?c-?r)\b/i, 3],
  ],
  "Electromagnetic Waves": [[/\belectromagnetic wave|displacement current\b/i, 3]],
  Optics: [
    [/\b(refractive index|total internal reflection|lens|mirror|prism)\b/i, 3],
    [/\b(interference|diffraction|polaris|young'?s double slit|fringe)\b/i, 3],
    [/\b(focal length|magnification)\b/i, 2],
  ],
  "Dual Nature of Matter and Radiation": [
    [/\b(photoelectric|work function|de broglie|stopping potential|photon)\b/i, 3],
  ],
  "Atoms and Nuclei": [
    [/\b(bohr|rydberg|binding energy|radioactiv|half[- ]life|isotope|nuclear (fission|fusion))\b/i, 3],
    [/\b(alpha|beta|gamma) (particle|decay|ray)\b/i, 3],
  ],
  "Electronic Devices": [
    [/\b(semiconductor|diode|transistor|zener|logic gate|p-?n junction|rectifier)\b/i, 3],
  ],
};

/** NEET Chemistry — units exactly as in examSyllabus.js NEET. */
const NEET_CHEMISTRY = {
  "Some Basic Concepts in Chemistry": [
    [/\b(mole concept|molar mass|empirical formula|stoichiometr|limiting reagent)\b/i, 3],
    [/\bavogadro\b/i, 2],
    [/\b(number of (moles|molecules|atoms)|moles? of)\b/i, 3],
    [/\b(molecular mass|percentage composition|mass percent)\b/i, 3],
    [/\bN\s*_?A\s*=\s*6\.0/i, 3],
  ],
  "Atomic Structure": [
    [/\b(quantum number|orbital|aufbau|hund|pauli|heisenberg|schr[oö]dinger)\b/i, 3],
    [/\b(electronic configuration)\b/i, 2],
    [/\b(degenerate|azimuthal|principal quantum|magnetic quantum|spin)\b/i, 3],
    [/\b(de broglie wavelength of the electron|photoelectric.{0,20}atom)\b/i, 3],
    [/\b(ionisation (energy|enthalpy) of (the )?(hydrogen|lithium|helium)|ground state of)\b/i, 3],
  ],
  "Chemical Bonding and Molecular Structure": [
    [/\b(hybridi[sz]ation|vsepr|bond order|molecular orbital|resonance structure|dipole moment)\b/i, 3],
    [/\b(sigma|pi) bond\b/i, 2],
  ],
  "Chemical Thermodynamics": [
    [/\b(enthalpy|entropy|gibbs|hess'?s law|internal energy|spontaneit)\b/i, 3],
    [/\b(standard )?free energy( change)?\b/i, 3],
    [/\b(ΔG|ΔH|ΔS)\b/, 3],
    [/\bbond dissociation energy\b/i, 3],
  ],
  Solutions: [
    [/\b(molarity|molality|mole fraction|raoult|colligative|osmotic pressure|van'?t hoff)\b/i, 3],
    [/\b(depression in freezing|elevation in boiling)\b/i, 3],
  ],
  Equilibrium: [
    [/\b(le chatelier|equilibrium constant|kp|kc|buffer|solubility product|ksp)\b/i, 3],
    [/\b(p\s?h|ionisation constant|degree of dissociation)\b/i, 2],
  ],
  "Redox Reactions and Electrochemistry": [
    [/\b(oxidation (state|number)|reduction potential|electrochemical cell|nernst|electrolysis|faraday'?s law)\b/i, 3],
    [/\b(galvanic|emf of the cell|conductivity)\b/i, 3],
  ],
  "Chemical Kinetics": [
    [/\b(rate (constant|law|of reaction)|order of reaction|arrhenius|activation energy|half[- ]life of)\b/i, 3],
  ],
  "Classification of Elements and Periodicity in Properties": [
    [/\b(periodic (table|trend|propert)|ionisation enthalpy|electronegativity|atomic radius)\b/i, 3],
  ],
  "p-Block Elements": [[/\bp-?block\b/i, 3], [/\b(boron|carbon|nitrogen|oxygen|halogen|noble gas) family\b/i, 3]],
  "d- and f-Block Elements": [
    [/\b[df]-?block\b/i, 3],
    [/\b(lanthan|actin|transition (element|metal))\b/i, 3],
  ],
  "Co-ordination Compounds": [
    [/\b(coordination (compound|number)|ligand|crystal field|chelate|isomerism in complex)\b/i, 3],
  ],
  "Some Basic Principles of Organic Chemistry": [
    [/\b(inductive effect|hyperconjugation|carbocation|carbanion|free radical|nucleophil|electrophil)\b/i, 3],
    [/\b(iupac name)\b/i, 2],
  ],
  Hydrocarbons: [[/\b(alkane|alkene|alkyne|aromatic|benzene|markovnikov)\b/i, 3]],
  "Organic Compounds Containing Halogens": [[/\b(haloalkane|haloarene|sn1|sn2|alkyl halide)\b/i, 3]],
  "Organic Compounds Containing Oxygen": [
    [/\b(alcohol|phenol|ether|aldehyde|ketone|carboxylic acid|ester)\b/i, 3],
  ],
  "Organic Compounds Containing Nitrogen": [
    [/\b(amine|amide|nitro compound|diazonium)\b/i, 3],
    [/\b(hofmann|gabriel|carbylamine|sandmeyer|azo dye|aniline)\b/i, 3],
  ],
  Biomolecules: [
    [/\b(carbohydrate|amino acid|protein|nucleic acid|vitamin|enzyme)\b/i, 3],
    [/\b(polysaccharide|monosaccharide|disaccharide|glucose|fructose|sucrose|starch|cellulose)\b/i, 3],
    [/\b(dna|rna|nucleotide|nucleoside|peptide|zwitterion)\b/i, 3],
  ],
  // NEET does not examine these two as separate units, but JEE Main does, and
  // the same table serves both. They score only on terms NEET's own units never
  // claim, so adding them cannot pull a NEET question off its correct unit.
  "Purification and Characterisation of Organic Compounds": [
    [/\b(kjeldahl|lassaigne|dumas|carius)\b/i, 3],
    [/\b(steam|fractional|vacuum) distillation\b/i, 3],
    [/\b(chromatograph|sublimation|crystallis|recrystallis)\w*\b/i, 3],
    [/\b(percentage|estimation) of (nitrogen|halogen|sulphur|carbon and hydrogen)\b/i, 3],
  ],
  "Principles Related to Practical Chemistry": [
    [/\b(qualitative analysis|salt analysis|systematic analysis)\b/i, 3],
    [/\b(detection|identification) of (the )?(cation|anion|functional group|radical)\b/i, 3],
    [/\b(brown ring|lassaigne'?s test|borax bead|flame test|group reagent)\b/i, 3],
    [/\b(titration|titrated|end point|indicator used)\b/i, 3],
  ],
};

/** NEET Biology — the 10 units exactly as in examSyllabus.js NEET. */
const NEET_BIOLOGY = {
  "Diversity in Living World": [
    [/\b(taxonom|classification of|five kingdom|nomenclature|angiosperm|gymnosperm|bryophyt|pteridophyt|algae|fungi|monera|protista)\b/i, 3],
  ],
  "Structural Organisation in Animals and Plants": [
    [/\b(anatomy of|morphology of|tissue system|meristem|epithelial tissue|earthworm|cockroach|frog)\b/i, 3],
  ],
  "Cell Structure and Function": [
    [/\b(mitochondri|chloroplast|ribosome|golgi|lysosome|endoplasmic|nucleus|cell wall|plasma membrane)\b/i, 3],
    [/\b(mitosis|meiosis|cell cycle)\b/i, 3],
  ],
  "Plant Physiology": [
    [/\b(photosynthesis|transpiration|stomata|xylem|phloem|calvin cycle|photorespiration|auxin|gibberellin|cytokinin)\b/i, 3],
    [/\b(mineral nutrition|plant growth regulator)\b/i, 3],
  ],
  "Human Physiology": [
    [/\b(digest|respirat|circulat|excret|nephron|neuron|hormone|endocrine|muscle contraction|haemoglobin|cardiac)\b/i, 3],
    [/\b(blood pressure|nerve impulse|reflex)\b/i, 2],
  ],
  Reproduction: [
    [/\b(gametogenesis|fertilisation|embryo sac|pollination|menstrual|spermatogenesis|oogenesis|placenta|contracept)\b/i, 3],
    [/\b(reproductive (system|health))\b/i, 3],
  ],
  "Genetics and Evolution": [
    [/\b(mendel|dihybrid|monohybrid|linkage|mutation|dna replication|transcription|translation|codon|hardy[- ]weinberg|natural selection|darwin)\b/i, 3],
    [/\b(chromosom|allele|genotype|phenotype)\b/i, 2],
  ],
  "Biology and Human Welfare": [
    [/\b(pathogen|malaria|typhoid|immunit|antibod|vaccine|cancer|drug abuse|apiculture|animal husbandry)\b/i, 3],
  ],
  "Biotechnology and Its Applications": [
    [/\b(recombinant dna|plasmid|restriction enzyme|pcr|gene therapy|transgenic|bt cotton|cloning vector)\b/i, 3],
  ],
  "Ecology and Environment": [
    [/\b(ecosystem|food chain|trophic level|biodiversity|pollution|population (growth|interaction)|succession|biogeochemical)\b/i, 3],
  ],
};

/**
 * GATE Metallurgical Engineering.
 *
 * The paper's own subject label is just "MT" — the key's Subject Name column
 * holds GA or MT and nothing finer — so unlike JEE, where the subject is given
 * and only the chapter has to be found, here the syllabus AREA has to be
 * recovered from the question text as well. Unit names follow the tree in
 * src/test/test_gate_mt.js so the two group together.
 *
 * Metallurgy's areas overlap more than a school syllabus does: diffusion is
 * transport phenomena and also phase transformation, a phase diagram is
 * thermodynamics and also physical metallurgy. Weight 3 is reserved for terms
 * that belong to one area only — "Ellingham", "blast furnace", "Charpy" — and
 * the tie rule in tagTopic leaves the genuinely ambiguous ones untagged.
 */
const GATE_METALLURGY = {
  "Engineering Mathematics": [
    [/\b(eigen ?value|eigen ?vector|determinant|matrix|matrices)\b/i, 3],
    [/\b(laplace transform|fourier series|taylor series|maclaurin)\b/i, 3],
    [/\b(bisection|newton[- ]raphson|secant method|simpson|trapezoidal)\b/i, 3],
    [/\b(differential equation|ODE|PDE)\b/, 3],
    [/\b(probability|standard deviation|poisson|binomial distribution|least squares)\b/i, 3],
    [/\b(gradient|divergence|curl|stokes|green'?s theorem|gauss divergence)\b/i, 3],
    [/\b(limit|derivative|integral|continuity|differentiab)/i, 1],
  ],
  "Thermodynamics and Rate Processes": [
    [/\bellingham\b/i, 3],
    [/\b(gibbs (free )?energy|helmholtz|chemical potential|maxwell relation)\b/i, 3],
    [/\b(activity coefficient|regular solution|raoult|henry'?s law)\b/i, 3],
    [/\b(nernst|pourbaix|electrode potential|electrochemical (cell|series))\b/i, 3],
    [/\b(entropy|enthalpy)\b/i, 2],
    [/\b(equilibrium constant|partial pressure|fugacity)\b/i, 2],
    [/\b(phase rule|lever rule)\b/i, 2],
  ],
  "Transport Phenomena": [
    [/\b(reynolds|nusselt|prandtl|sherwood|schmidt|grashof) number\b/i, 3],
    [/\b(bernoulli|shell balance|hagen[- ]poiseuille|buckingham)\b/i, 3],
    [/\b(stefan[- ]boltzmann|emissivity|radiative heat|forced convection|natural convection)\b/i, 3],
    [/\b(fick'?s (first |second )?law|mass transfer coefficient)\b/i, 3],
    [/\b(thermal conductivity|heat flux|conduction|convection)\b/i, 2],
    [/\b(viscosity|laminar|turbulent|boundary layer)\b/i, 2],
  ],
  "Extractive Metallurgy": [
    [/\b(blast furnace|converter|BOF|basic oxygen|cupola|tuyere|slag basicity)\b/i, 3],
    [/\b(froth flotation|comminution|beneficiation|sintering of ore|pelletis|calcination|roasting)\b/i, 3],
    [/\b(hall[- ]h[eé]roult|bayer process|leaching|electrowinning|electrorefining|cyanidation)\b/i, 3],
    [/\b(matte|smelt|ladle|desulphuris|dephosphoris|deoxidat)/i, 3],
    [/\b(ore|flux|slag|gangue)\b/i, 1],
  ],
  "Physical Metallurgy": [
    [/\b(burgers vector|dislocation|stacking fault|grain boundary|twin(ning)?)\b/i, 3],
    [/\b(martensit|bainit|pearlit|austenit|ferrite|cementite|TTT|CCT) /i, 3],
    [/\b(nucleation and growth|spinodal|precipitation harden|age harden|recrystallis|recovery and growth)\b/i, 3],
    [/\b(BCC|FCC|HCP|miller indices|bravais|x-?ray diffraction|bragg)\b/i, 3],
    [/\b(vacanc|interstitial|substitutional|point defect)\b/i, 2],
    [/\b(phase diagram|eutectic|eutectoid|peritectic eutectoid|invariant reaction)\b/i, 2],
    [/\b(annealing|quench|temper|normalis)/i, 2],
  ],
  "Mechanical Metallurgy": [
    [/\b(charpy|izod|fracture toughness|K ?IC|paris law|griffith)\b/i, 3],
    [/\b(s-?n curve|fatigue (life|limit|strength)|creep (rate|rupture)|larson[- ]miller)\b/i, 3],
    [/\b(true stress|engineering stress|strain harden|work harden|yield (strength|criterion)|von mises|tresca)\b/i, 3],
    [/\b(hall[- ]petch|hardness (test|number)|brinell|vickers|rockwell)\b/i, 3],
    [/\b(ductile[- ]brittle|necking|elongation|toughness)\b/i, 2],
    [/\b(elastic modulus|young'?s modulus|poisson'?s ratio)\b/i, 2],
  ],
  "Manufacturing Processes": [
    [/\b(sand cast|investment cast|die cast|riser|gating system|shrinkage cavity|chvorinov)\b/i, 3],
    [/\b(rolling mill|forging|extrusion|wire drawing|deep drawing|sheet metal)\b/i, 3],
    [/\b(arc welding|MIG|TIG|submerged arc|weld pool|heat affected zone|HAZ)\b/i, 3],
    [/\b(powder metallurgy|sintering of (green|compact)|green compact)\b/i, 3],
    [/\b(machining|turning|milling|tool wear|cutting speed)\b/i, 2],
  ],
};

const TABLES = {
  "JEE_MAIN:Mathematics": JEE_MATHS,
  "GATE_MT:Metallurgical Engineering": GATE_METALLURGY,
  "NEET:Physics": NEET_PHYSICS,
  "NEET:Chemistry": NEET_CHEMISTRY,
  "NEET:Biology": NEET_BIOLOGY,
  // JEE Main and NEET share their Physics and Chemistry syllabus almost
  // entirely, and examSyllabus.js lists the same unit names for both, so the
  // same tables serve both exams.
  "JEE_MAIN:Physics": NEET_PHYSICS,
  "JEE_MAIN:Chemistry": NEET_CHEMISTRY,
  "JEE_ADVANCED:Physics": NEET_PHYSICS,
  "JEE_ADVANCED:Chemistry": NEET_CHEMISTRY,
  "JEE_ADVANCED:Mathematics": JEE_MATHS,
};

/** Minimum score before a guess is trusted. A single weak hit is not enough. */
const CONFIDENCE_FLOOR = 3;

/**
 * Best-matching syllabus topic for a question, or null when nothing scores
 * clearly enough.
 *
 * @param {string} text        question text (options may be appended)
 * @param {string} examCode    e.g. "JEE_MAIN"
 * @param {string} subject     e.g. "Mathematics"
 * @returns {{topic: string, score: number, runnerUp: string|null}|null}
 */
export function tagTopic(text, examCode, subject) {
  const table = TABLES[`${examCode}:${subject}`];
  if (!table || !text) return null;

  const scores = [];
  for (const [topic, signals] of Object.entries(table)) {
    let score = 0;
    for (const [pattern, weight] of signals) if (pattern.test(text)) score += weight;
    if (score > 0) scores.push({ topic, score });
  }
  if (!scores.length) return null;

  scores.sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  if (best.score < CONFIDENCE_FLOOR) return null;
  // A tie is not a classification. Leave it untagged rather than pick one.
  if (second && second.score === best.score) return null;

  return { topic: best.topic, score: best.score, runnerUp: second?.topic ?? null };
}

/** Which exam/subject pairs have a table. */
export const taggableSubjects = () => Object.keys(TABLES);
