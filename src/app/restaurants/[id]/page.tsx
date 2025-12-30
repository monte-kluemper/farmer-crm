export default function RestaurantPage({ params }: { params: { id: string } }) {
    return (
        <div className="p-6">
            <h1 className="text-2xl font-semibold">Restaurant</h1>
            <p className="text-sm text-muted-foreground">ID: {params.id}</p>
        </div>
    );
}
