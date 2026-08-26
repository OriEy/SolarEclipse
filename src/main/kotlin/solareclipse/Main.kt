package solar

import solareclipse.Body
import solareclipse.Vector3
import java.time.Duration
import java.time.Instant

class EclipseFinderManual {

    val startDate: Instant = Instant.parse("1990-01-01T00:00:00.0000Z")
    /**
     * Gravitational constant in **km³ kg⁻¹ s⁻²**, i.e. the SI value 6.67430e-11 m³ kg⁻¹ s⁻² scaled
     * by 1e-9. The state vectors below are the km / km-per-second ones from JPL Horizons, so using
     * the SI value here would overstate every acceleration by a factor of 1e9.
     */
    val G = 6.67430e-20
    val secondsPerStep = 1L

    /** First and last step of the eclipse currently being collected, or null between eclipses. */
    private var eclipseStart: Long? = null
    private var eclipseEnd: Long? = null

    fun findEclipsesUntil(to: Instant) {
        val startSeconds = startDate.epochSecond
        val endSeconds = to.epochSecond
        val accs = Array(ALL.size) { Vector3.ZERO }
        for (step in startSeconds..endSeconds step secondsPerStep) {
            // Has to be cleared every step, otherwise each step adds to the previous step's
            // acceleration instead of replacing it and the bodies fly apart.
            accs.fill(Vector3.ZERO)
            for (i in ALL.indices) {
                for (j in ALL.indices) {
                    if (i == j) {
                        continue
                    }
                    val pos1 = ALL[i].position
                    val pos2 = ALL[j].position

                    // F = G*m1*m2 / r², F = m*a, so a_i = G*m2 / r² towards j - the mass of the
                    // body being accelerated cancels. Everything here is in km, so [G] is the
                    // km³ variant.
                    val vectorToJ = pos2.minus(pos1)
                    val r = vectorToJ.norm
                    val acc = ALL[j].massKg * G / (r * r)
                    accs[i] += vectorToJ.normalized() * acc
                }
            }
            for (i in ALL.indices) {
                val obj = ALL[i]
                obj.velocity += accs[i] * (1.0 * secondsPerStep)
                obj.position += obj.velocity * (1.0 * secondsPerStep)
            }
            checkForEclipses(step)
        }
        // An eclipse still in progress when the loop ends would otherwise never be printed.
        reportSolarEclipse()
    }

    private fun checkForEclipses(step: Long) {
        val solar = checkForSolarEclipse()
        if (solar) {
            if (eclipseStart == null) {
                eclipseStart = step
            }
            eclipseEnd = step
        } else {
            // First step that is no longer an eclipse, so the window just closed.
            reportSolarEclipse()
        }
    }

    /**
     * Prints the eclipse window collected so far and clears it, so that one eclipse produces one
     * line rather than one line per step.
     *
     * The middle is quoted as the greatest eclipse: the shadow axis crosses the Earth in very
     * nearly a straight line, and the midpoint of a chord through a sphere is its closest approach
     * to the centre, which is how the canon defines that instant. It is only as exact as the
     * straight line is, plus half a [secondsPerStep] of sampling.
     */
    private fun reportSolarEclipse() {
        val from = eclipseStart ?: return
        val until = eclipseEnd ?: return
        // The sampled window covers one step more than the gap between its first and last step.
        val duration = Duration.ofSeconds(until - from + secondsPerStep)
        println(
            "${Instant.ofEpochSecond(from)}\t" +
                    "${Instant.ofEpochSecond(until)}\t" +
                    "${duration.toMinutes()}m${duration.toSecondsPart()}s"
        )
        eclipseStart = null
        eclipseEnd = null
    }

    // Very simple check. Draw a line through the suns center and the moons center.
    // Check if it intersects earth.
    private fun checkForSolarEclipse(): Boolean {
        val directionSunMoon = SUN.position - MOON.position
        val startingPoint = MOON.position
        val earthCenter = EARTH.position
        // The line is infinite in both directions, so it also runs through the Earth during a
        // *lunar* eclipse, when the Earth is between the Sun and the Moon. In that case the Earth
        // lies on the sunward side of the Moon and the dot product is positive; during a solar
        // eclipse the Moon is in the middle and the Earth is behind it, so it is negative.
        if ((earthCenter - startingPoint) dot directionSunMoon > 0.0) {
            return false
        }
        val distance = calculateDistance(startingPoint, directionSunMoon, earthCenter)
        return distance < EARTH.radiusKm
    }

    /**
     * Calculates the distance between a line and a point
     *
     * The line runs through [startingPoint] along [directionSunMoon] and is infinite in *both*
     * directions. With `w = earthCenter - startingPoint` the perpendicular distance is
     * `|w x d| / |d|`: the cross product's length is `|w| * |d| * sin(angle)`, so dividing by
     * `|d|` leaves `|w| * sin(angle)`, which is the opposite side of the right triangle.
     *
     * Taking the cross product rather than subtracting the projection (`sqrt(|w|^2 - (w.d^)^2)`)
     * matters here: near an eclipse the point lies almost on the line, and the projection form
     * then subtracts two nearly equal large numbers and loses most of its significant digits.
     *
     * Units follow the inputs, so km in, km out.
     */
    private fun calculateDistance(
        startingPoint: Vector3,
        directionSunMoon: Vector3,
        earthCenter: Vector3
    ): Double =
        ((earthCenter - startingPoint) cross directionSunMoon).norm / directionSunMoon.norm

    val SUN = Body(
        name = "Sun",
        massKg = 1.98841e+30,
        radiusKm = 695700.0,
        position = Vector3(-1.006737139570906E+05, 3.320876462003723E+04, -4.090396664935810E+03),
        velocity = Vector3(9.673251064599896E-03, -3.096932838957836E-05, -1.664728525974412E-04),
    )

    val MERCURY = Body(
        name = "Mercury",
        massKg = 3.301001e+23,
        radiusKm = 2439.4,
        position = Vector3(2.439050909049153E+07, 3.948001816981459E+07, 9.691700404811408E+05),
        velocity = Vector3(-5.108299864791032E+01, 2.765409893499971E+01, 6.949359672264231E+00),
    )

    val VENUS = Body(
        name = "Venus",
        massKg = 4.867306e+24,
        radiusKm = 6051.84,
        position = Vector3(5.36373403918148E+05, 1.076841666428808E+08, 1.427053989074513E+06),
        velocity = Vector3(-3.513015572573093E+01, 2.211498038236492E-02, 2.028819424584861E+00),
    )

    val EARTH = Body(
        name = "Earth",
        massKg = 5.972168e+24,
        radiusKm = 6371.01,
        position = Vector3(-2.677216732206378E+07, 1.447000934456689E+08, -8.716752117872238E+02),
        velocity = Vector3(-2.977727541182376E+01, -5.521956668248810E+00, -1.528263911582783E-03),
    )
    val MOON = Body(
        name = "Moon",
        massKg = 7.345789e+22,
        radiusKm = 1737.53,
        position = Vector3(-2.645404681767365E+07, 1.444910089564225E+08, 4.946273419983685E+03),
        velocity = Vector3(-2.924319807419696E+01, -4.642533411708550E+00, 9.004296477663498E-02),
    )

    val MARS = Body(
        name = "Mars",
        massKg = 6.416909e+23,
        radiusKm = 3389.92,
        position = Vector3(-1.461592217605970E+08, -1.796725128225628E+08, -1.748789344647229E+05),
        velocity = Vector3(1.972984684589884E+01, -1.320860094883886E+01, -7.619016913003440E-01),
    )

    val JUPITER = Body(
        name = "Jupiter",
        massKg = 1.898518e+27,
        radiusKm = 69911.0,
        position = Vector3(-8.493793618952541E+07 , 7.658918589225457E+08 ,-1.273525058914423E+06),
        velocity = Vector3(-1.315587234739015E+01 ,-8.320112388059692E-01 , 2.981679023688071E-01),
    )

    val SATURN = Body(
        name = "Saturn",
        massKg = 5.684579e+26,
        radiusKm = 58232.0,
        position = Vector3(4.199198476506634E+08, -1.439978046027270E+09, 8.408278793036819E+06),
        velocity = Vector3(8.752777451436943E+00, 2.678133416123971E+00, -3.949813167287872E-01),
    )

    val URANUS = Body(
        name = "Uranus",
        massKg = 8.681894e+25,
        radiusKm = 25362.0,
        position = Vector3(2.862527965673319E+08, -2.884967691519700E+09, -1.442373628245139E+07),
        velocity = Vector3(6.725455589474818E+00, 3.560460134431160E-01, -8.573865410667825E-02),
    )

    val NEPTUNE = Body(
        name = "Neptune",
        massKg = 1.024306e+26,
        radiusKm = 24624.0,
        position = Vector3(9.562516089340924E+08, -4.416503202875764E+09, 6.890785069466805E+07),
        velocity = Vector3(5.277748637077880E+00, 1.180888411425374E+00, -1.456632078127478E-01),
    )

    val ALL: List<Body> = listOf(
        SUN,
        MERCURY,
        VENUS,
        EARTH,
        MOON,
        MARS,
        JUPITER,
        SATURN,
        URANUS,
        NEPTUNE
    )
}

fun main() {
    EclipseFinderManual().findEclipsesUntil(Instant.parse("2040-01-01T00:00:00.0000Z"))
}