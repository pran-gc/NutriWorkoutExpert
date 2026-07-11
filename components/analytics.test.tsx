import { render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { LineChart, MacroRings } from './analytics';

describe('analytics chart primitives', () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  it('renders a lap marker only for macro overshoot, not exactly 100%', async () => {
    const exact = await render(
      <MacroRings
        calories={1200}
        calorieTarget={2400}
        protein={100}
        proteinTarget={100}
        carbs={0}
        carbsTarget={200}
        fat={0}
        fatTarget={70}
      />
    );
    expect(exact.queryByTestId('macro-lap-protein')).toBeNull();

    const overshoot = await render(
      <MacroRings
        calories={1200}
        calorieTarget={2400}
        protein={150}
        proteinTarget={100}
        carbs={0}
        carbsTarget={200}
        fat={0}
        fatTarget={70}
      />
    );
    expect(overshoot.getByTestId('macro-lap-protein')).toBeTruthy();
  });

  it('uses the reduced-motion fallback by querying AccessibilityInfo', async () => {
    await render(
      <MacroRings
        calories={1200}
        calorieTarget={2400}
        protein={50}
        proteinTarget={100}
        carbs={0}
        carbsTarget={200}
        fat={0}
        fatTarget={70}
      />
    );
    expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled();
  });

  it('renders line charts with one point and multi-week gaps', async () => {
    const one = await render(<LineChart points={[{ logged_on: '2026-01-01', value: 80 }]} />);
    expect(one.getByTestId('line-chart-average')).toBeTruthy();

    const gap = await render(
      <LineChart
        points={[
          { logged_on: '2026-01-01', value: 80 },
          { logged_on: '2026-02-20', value: 78 },
        ]}
      />
    );
    expect(gap.getByTestId('line-chart-average')).toBeTruthy();
  });

  it('omits the dashed target line when no target is set', async () => {
    const chart = await render(<LineChart points={[{ logged_on: '2026-01-01', value: 80 }]} target={null} />);
    expect(chart.queryByTestId('line-chart-target')).toBeNull();
  });
});
