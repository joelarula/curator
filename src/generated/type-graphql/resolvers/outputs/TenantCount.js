"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantCount = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const TenantCountProjectsArgs_1 = require("./args/TenantCountProjectsArgs");
let TenantCount = class TenantCount {
    getProjects(root, args) {
        return root.projects;
    }
};
exports.TenantCount = TenantCount;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        name: "projects",
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Root()),
    tslib_1.__param(1, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [TenantCount, TenantCountProjectsArgs_1.TenantCountProjectsArgs]),
    tslib_1.__metadata("design:returntype", Number)
], TenantCount.prototype, "getProjects", null);
exports.TenantCount = TenantCount = tslib_1.__decorate([
    TypeGraphQL.ObjectType("TenantCount", {})
], TenantCount);
