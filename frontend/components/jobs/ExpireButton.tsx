export const ExpireButton = ({
    id,
    onClick,
}: {
    id: string;
    onClick: (id: string) => void;
}) => (
    <button
        type="button"
        onClick={(e) => {
            e.stopPropagation();
            onClick(id);
        }}
        className="cursor-pointer rounded-full border border-zinc-300 bg-white text-sm text-gray-500 hover:text-red-600 py-2 px-4 ml-auto"
    >
        Mark As Expired
    </button>
);
