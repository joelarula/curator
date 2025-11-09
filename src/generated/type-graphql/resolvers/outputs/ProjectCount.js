"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectCount = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ProjectCountFilesArgs_1 = require("./args/ProjectCountFilesArgs");
let ProjectCount = class ProjectCount {
    getFiles(root, args) {
        return root.files;
    }
};
exports.ProjectCount = ProjectCount;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        name: "files",
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Root()),
    tslib_1.__param(1, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [ProjectCount, ProjectCountFilesArgs_1.ProjectCountFilesArgs]),
    tslib_1.__metadata("design:returntype", Number)
], ProjectCount.prototype, "getFiles", null);
exports.ProjectCount = ProjectCount = tslib_1.__decorate([
    TypeGraphQL.ObjectType("ProjectCount", {})
], ProjectCount);
