# syntax=docker/dockerfile:1
FROM maven:3.9-eclipse-temurin-21 AS build
# Maven Central rate-limits anonymous CI/Docker builds (HTTP 429); default to the GCS mirror of Central.
ARG MAVEN_MIRROR=https://maven-central.storage-download.googleapis.com/maven2/
RUN mkdir -p /root/.m2 && printf '<settings><mirrors><mirror><id>central-mirror</id><mirrorOf>central</mirrorOf><url>%s</url></mirror></mirrors></settings>' "$MAVEN_MIRROR" > /root/.m2/settings.xml
WORKDIR /build
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2/repository mvn -B -q dependency:go-offline
COPY src ./src
RUN --mount=type=cache,target=/root/.m2/repository mvn -B -q -DskipTests package && \
    java -Djarmode=tools -jar target/*.jar extract --layers --launcher --destination extracted

FROM eclipse-temurin:21-jre
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home /app olb
WORKDIR /app
COPY --from=build /build/extracted/dependencies/ ./
COPY --from=build /build/extracted/spring-boot-loader/ ./
COPY --from=build /build/extracted/snapshot-dependencies/ ./
COPY --from=build /build/extracted/application/ ./
USER olb
EXPOSE 8080
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -Duser.timezone=UTC"
HEALTHCHECK --interval=10s --timeout=3s --start-period=40s --retries=6 \
  CMD curl -fsS http://localhost:8080/actuator/health/readiness || exit 1
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
