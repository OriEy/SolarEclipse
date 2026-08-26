package solareclipse

data class Body(
    val name: String,
    val massKg: Double,
    val radiusKm: Double,
    var position: Vector3,
    var velocity: Vector3
)