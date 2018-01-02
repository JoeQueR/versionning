const fs = require('fs');
const child_process = require('child_process');
class VersionsForApp {
    get versions() {
        return this._versions;
    }
    constructor(appName) {
        this._versions = VersionsForApp.fetchVersions(appName);
    }
    static fetchVersions(appName) {
        const versionsFetched = JSON.parse(VersionsForApp.execFetchVersions(appName));
        console.log('Versions fetched for ' + appName + ',', versionsFetched);
        return versionsFetched.length <= 0 ? [] : versionsFetched;
    }
    static execFetchVersions(appName) {
        try {
            return child_process.execSync('npm view ' + appName + ' versions --json', { encoding: 'utf8' });
        }
        catch (e) {
            console.error('Error fetching versions for ' + appName);
            throw e;
        }
    }
    filterVersion(versionToFilter) {
        return this.versions.filter((value => value.startsWith(versionToFilter)));
    }
    hasReleaseForVersion(version) {
        return this.filterVersion(version).filter((versionFilterred) => versionFilterred.indexOf('-') === -1).length > 0;
    }
    getLastSnapshot(version) {
        return this.filterVersion(version)
            .slice(0)
            .filter((versionToFilter) => versionToFilter.indexOf('-') !== -1)
            .sort()
            .reverse()
            .shift();
    }
}
class Package {
    constructor() {
        this._package = Package.getCurrentPackage();
        const indexOfSnapshotCharacter = this.version.indexOf('-');
        if (indexOfSnapshotCharacter !== -1) {
            this._package.version = this._package.version.substring(0, indexOfSnapshotCharacter);
        }
        this._existOnRepo = this.calculExistOnRepo();
        if (!this._existOnRepo) {
            console.warn('App seems to have not been released yet (ignore this warning if it\'s the first time the app is release)');
            return;
        }
        this._versionsForApp = new VersionsForApp(this.name);
    }
    get existOnRepo() {
        return this._existOnRepo;
    }
    get name() {
        return this._package.name;
    }
    get version() {
        return this._package.version;
    }
    static getCurrentPackage() {
        try {
            const dataFromFile = fs.readFileSync(Package.filePath, Package.fileEncoding);
            return JSON.parse(dataFromFile);
        }
        catch (e) {
            console.log(e);
            throw e;
        }
    }
    calculExistOnRepo() {
        let result = child_process.execSync('npm search ' + this.name, { encoding: Package.fileEncoding });
        if (result.length <= 0) {
            return false;
        }
        result = result.split('\n');
        if (result.length <= 0) {
            return false;
        }
        result.shift();
        if (result.length <= 0) {
            return false;
        }
        result = result.filter((line) => line !== '' && line.startsWith(this.name + ' '));
        return result.length > 0;
    }
    isAlreadyReleased() {
        return this.existOnRepo && this._versionsForApp.hasReleaseForVersion(this.version);
    }
    setToLastSnapshotOfCurrentVersion() {
        if (!this._versionsForApp || this._versionsForApp.filterVersion(this.version).length <= 0) {
            // No previous prerelease, init to 0
            this._package.version += '-0';
        }
        else {
            this._package.version = this._versionsForApp.getLastSnapshot(this.version);
            console.log('set to previous snapshot: ', this._package.version);
        }
        this.apply();
    }
    apply() {
        fs.writeFileSync(Package.filePath, JSON.stringify(this._package), Package.fileEncoding);
    }
}
Package.filePath = './package.json';
Package.fileEncoding = 'utf8';
class Snapshot {
    static snapshot() {
        try {
            child_process.execSync('npm version prerelease');
        }
        catch (e) {
            console.error('Error during "npm version prerelease');
            throw e;
        }
    }
    constructor() {
        this._package = new Package();
    }
    run() {
        console.log('Snapshot begin...');
        if (this._package.isAlreadyReleased()) {
            throw new Error('Package "' + this._package.name + '" already released for the version "' + this._package.version + '"');
        }
        this._package.setToLastSnapshotOfCurrentVersion();
        Snapshot.snapshot();
        console.log('Snapshot done! Version set: ' + Package.getCurrentPackage().version);
    }
}
(new Snapshot()).run();
