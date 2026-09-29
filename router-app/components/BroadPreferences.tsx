import { broadPreferences, broadInterests } from "../lib/preferences";
export function BroadPreferences({ selected }: { selected: unknown }) {
  const choices = broadInterests(selected);
  return (
    <fieldset className="broad-preferences">
      <legend>What interests you?</legend>
      <p>
        Choose any that interest you, or skip. These bring relevant panels
        forward; all of KOMA stays available.
      </p>
      <div>
        {broadPreferences.map((value) => (
          <label key={value}>
            <input
              type="checkbox"
              name="interests"
              value={value}
              defaultChecked={choices.includes(value)}
            />
            {value.toUpperCase()}
          </label>
        ))}
      </div>
      <p className="field-help">
        You can change these on Profile whenever you like.
      </p>
    </fieldset>
  );
}
