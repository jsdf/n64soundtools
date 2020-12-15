export function range(size, startAt = 0) {
  return [...Array(size).keys()].map((i) => i + startAt);
}

function scaleMapper(domain, range, rangeSize, domainValue) {
  // normalize to 0.0...1.0
  const normalized = (domainValue - domain[0]) / (domain[1] - domain[0]);
  // scale to range[0]...range[1]
  return normalized * rangeSize + range[0];
}

export function scaleLinear(domain, range, options = {}) {
  if (domain[0] > domain[1]) {
    throw new Error('domain must go from smaller to larger');
  }
  if (range[0] > range[1]) {
    throw new Error('range must go from smaller to larger');
  }

  // map a value in domain[0]...domain[1] to range[0]...range[1]
  const domainSize = domain[1] - domain[0];
  const rangeSize = range[1] - range[0];

  return {
    scale(domainValue) {
      let scaled = scaleMapper(domain, range, rangeSize, domainValue);
      if (options.clamp) {
        scaled = Math.max(Math.min(range[1], scaled), range[0]);
      }

      return scaled;
    },
    invert(rangeValue) {
      let scaled = scaleMapper(range, domain, domainSize, rangeValue);

      if (options.clamp) {
        scaled = Math.max(Math.min(domain[1], scaled), domain[0]);
      }
      return scaled;
    },
  };
}

export function scaleDiscreteArbitrary(domain, range, options = {}) {
  const linear = scaleLinear(domain, [0, 1], options);

  return {
    scale(domainValue) {
      const rangeValue = linear.scale(domainValue);

      return range[Math.round((range.length - 1) * rangeValue)];
    },
    invert(rangeValue) {
      const index = range.indexOf(rangeValue);
      if (index === -1) {
        throw new Error('scaleQuantized value not in range');
      }

      return linear.invert(index / (range.length - 1));
    },
  };
}

export function scaleDiscreteQuantized(domain, range, options = {}) {
  const linear = scaleLinear(domain, range, options);

  if (options.stepSize == null) {
    throw new Error('stepSize option is required');
  }

  return {
    scale(domainValue) {
      const rangeValue = linear.scale(domainValue);

      const round = options.round ?? Math.floor;

      return (
        range[0] +
        round((rangeValue - range[0]) / options.stepSize) * options.stepSize
      );
    },
    invert(rangeValue) {
      return linear.invert(rangeValue);
    },
  };
}
