package solareclipse

import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt


data class Vector3(val x: Double, val y: Double, val z: Double) {

    operator fun plus(other: Vector3) = Vector3(x + other.x, y + other.y, z + other.z)

    operator fun minus(other: Vector3) = Vector3(x - other.x, y - other.y, z - other.z)

    operator fun times(scalar: Double) = Vector3(x * scalar, y * scalar, z * scalar)

    operator fun div(scalar: Double) = Vector3(x / scalar, y / scalar, z / scalar)

    operator fun unaryMinus() = Vector3(-x, -y, -z)

    infix fun dot(other: Vector3) = x * other.x + y * other.y + z * other.z

    infix fun cross(other: Vector3) = Vector3(
        y * other.z - z * other.y,
        z * other.x - x * other.z,
        x * other.y - y * other.x,
    )

    val norm: Double get() = sqrt(this dot this)

    val normSquared: Double get() = this dot this

    /** Unit vector in the same direction. Undefined for the zero vector. */
    fun normalized(): Vector3 = this / norm

    companion object {
        val ZERO = Vector3(0.0, 0.0, 0.0)
    }
}