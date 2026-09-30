export const HighScoreInput = ({
    highScore,
    onChange,
}: {
    highScore: number | null;
    onChange: (v: number) => void;
}) => {
    return (
        <input
            onChange={(e) => {
                const value = e.target.value;
                onChange(Number(value ?? "0"));
            }}
            className="shadow rounded-lg placeholder:p-4 min-w-60"
            value={highScore === null ? "" : highScore}
            min={0}
            max={100}
            type="number"
            placeholder="Choose your highscore"
        />
    );
};
